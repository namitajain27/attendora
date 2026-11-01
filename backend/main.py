import base64
import hashlib
import hmac
import os
import time
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import face_utils
from database import Base, engine, get_db  # also loads .env
from models import Attendance, Student

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
FRONTEND_DIR = BASE_DIR.parent / "frontend"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- settings
TEACHER_ID = os.getenv("TEACHER_ID", "TCH001")
TEACHER_PASSWORD = os.getenv("TEACHER_PASSWORD", "admin123")
TEACHER_NAME = os.getenv("TEACHER_NAME", "Teacher")
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key")
TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "12"))
FACE_TOLERANCE = float(os.getenv("FACE_TOLERANCE", "0.5"))  # lower = stricter
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

app = FastAPI(title="Attendora API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


# -------------------------------------------------------------------- auth
def make_token(teacher_id: str) -> str:
    expires = int(time.time()) + TOKEN_HOURS * 3600
    payload = f"{teacher_id}|{expires}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{sig}".encode()).decode()


def verify_token(token: str) -> bool:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        teacher_id, expires, sig = raw.rsplit("|", 2)
        expected = hmac.new(
            SECRET_KEY.encode(), f"{teacher_id}|{expires}".encode(), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(sig, expected) and int(expires) > time.time()
    except Exception:
        return False


def require_auth(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please log in.")
    if not verify_token(authorization[7:].strip()):
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")


class LoginRequest(BaseModel):
    teacher_id: str
    password: str


@app.post("/api/login")
def login(data: LoginRequest):
    ok_id = hmac.compare_digest(data.teacher_id.strip(), TEACHER_ID)
    ok_pw = hmac.compare_digest(data.password, TEACHER_PASSWORD)
    if not (ok_id and ok_pw):
        raise HTTPException(status_code=401, detail="Invalid Teacher ID or password.")
    return {
        "token": make_token(TEACHER_ID),
        "teacher_id": TEACHER_ID,
        "teacher_name": TEACHER_NAME,
    }


@app.get("/api/health")
def health():
    return {"message": "Welcome to Attendora API", "status": "running"}


# ----------------------------------------------------------------- helpers
def student_dict(s: Student) -> dict:
    return {
        "id": s.id,
        "student_id": s.student_id,
        "name": s.name,
        "course": s.course,
        "photo_path": s.photo_path,
        "has_face": bool(s.face_encoding),
        "created_at": s.created_at,
    }


def attendance_dict(a: Attendance, s: Student) -> dict:
    return {
        "id": a.id,
        "student_id": s.student_id,
        "name": s.name,
        "course": s.course,
        "date": a.date,
        "status": a.status,
        "method": a.method,
    }


def mark_present(db: Session, student: Student, method: str) -> bool:
    """Mark a student present for today. Returns True if newly marked."""
    today = date.today()
    record = (
        db.query(Attendance)
        .filter(Attendance.student_id == student.student_id, Attendance.day == today)
        .first()
    )
    if record and record.status == "Present":
        return False
    try:
        if record:  # was Absent -> now Present
            record.status = "Present"
            record.method = method
            record.date = datetime.now()
        else:
            db.add(
                Attendance(
                    student_id=student.student_id,
                    day=today,
                    date=datetime.now(),
                    status="Present",
                    method=method,
                )
            )
        db.commit()
        return True
    except IntegrityError:  # two requests raced
        db.rollback()
        return False


# ---------------------------------------------------------------- students
@app.get("/api/students", dependencies=[Depends(require_auth)])
def list_students(db: Session = Depends(get_db)):
    return [student_dict(s) for s in db.query(Student).order_by(Student.id).all()]


@app.post("/api/students", status_code=201, dependencies=[Depends(require_auth)])
async def create_student(
    student_id: str = Form(..., min_length=1, max_length=50),
    name: str = Form(..., min_length=1, max_length=100),
    course: Optional[str] = Form(default=None, max_length=100),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Enroll a student: saves details + face encoding in one step."""
    student_id = student_id.strip()
    name = name.strip()

    if db.query(Student).filter(Student.student_id == student_id).first():
        raise HTTPException(status_code=409, detail="Student ID already exists.")

    data = await photo.read(MAX_UPLOAD_BYTES + 1)
    await photo.close()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image size must be 5 MB or less.")

    try:
        image, encoding = face_utils.encode_single_face(data)
    except face_utils.FaceError as error:
        raise HTTPException(status_code=400, detail=str(error))

    # Reject the same face enrolled twice under a different ID
    existing = db.query(Student).filter(Student.face_encoding.isnot(None)).all()
    known = [face_utils.loads(s.face_encoding) for s in existing]
    index, _ = face_utils.best_match(known, np.array(encoding), FACE_TOLERANCE)
    if index is not None:
        raise HTTPException(
            status_code=409,
            detail=f"This face is already enrolled as {existing[index].name} ({existing[index].student_id}).",
        )

    filename = f"{uuid.uuid4().hex}.jpg"
    path = UPLOAD_DIR / filename
    path.write_bytes(face_utils.jpeg_bytes(image))

    new_student = Student(
        student_id=student_id,
        name=name,
        course=(course or "").strip() or None,
        photo_path=f"uploads/{filename}",
        face_encoding=face_utils.dumps(encoding),
    )
    db.add(new_student)
    try:
        db.commit()
        db.refresh(new_student)
    except IntegrityError:
        db.rollback()
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail="Student ID already exists.")
    return student_dict(new_student)


@app.delete("/api/students/{student_id}", dependencies=[Depends(require_auth)])
def delete_student(student_id: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.student_id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    if student.photo_path:
        (BASE_DIR / student.photo_path).unlink(missing_ok=True)
    db.query(Attendance).filter(Attendance.student_id == student_id).delete()
    db.delete(student)
    db.commit()
    return {"message": "Student deleted."}


# ------------------------------------------------------------- recognition
@app.post("/api/recognize", dependencies=[Depends(require_auth)])
async def recognize(
    image: UploadFile = File(...),
    mark: bool = Form(default=True),
    db: Session = Depends(get_db),
):
    """Receive one camera frame, find faces, match them, optionally mark Present."""
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    await image.close()
    try:
        img = face_utils.read_image(data, max_width=640)
    except face_utils.FaceError as error:
        raise HTTPException(status_code=400, detail=str(error))

    probes = face_utils.get_encodings(img)
    result = {"faces_detected": len(probes), "matches": []}
    if not probes:
        return result

    students = db.query(Student).filter(Student.face_encoding.isnot(None)).all()
    known = [face_utils.loads(s.face_encoding) for s in students]
    seen = set()

    for probe in probes:
        index, distance = face_utils.best_match(known, np.array(probe), FACE_TOLERANCE)
        if index is None:
            continue
        student = students[index]
        if student.student_id in seen:
            continue
        seen.add(student.student_id)

        newly_marked = mark_present(db, student, "Face Recognition") if mark else False
        today_record = (
            db.query(Attendance)
            .filter(Attendance.student_id == student.student_id, Attendance.day == date.today())
            .first()
        )
        result["matches"].append(
            {
                "student_id": student.student_id,
                "name": student.name,
                "course": student.course,
                "confidence": round((1 - distance) * 100, 1),
                "newly_marked": newly_marked,
                "already_marked": bool(today_record and today_record.status == "Present")
                and not newly_marked,
            }
        )
    return result


# -------------------------------------------------------------- attendance
class AttendanceCreate(BaseModel):
    student_id: str
    status: str = "Present"
    method: str = Field(default="Manual Entry", max_length=50)


@app.post("/api/attendance", status_code=201, dependencies=[Depends(require_auth)])
def mark_attendance(attendance: AttendanceCreate, db: Session = Depends(get_db)):
    """Manual attendance (one record per student per day; re-marking updates it)."""
    student = db.query(Student).filter(Student.student_id == attendance.student_id.strip()).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found. Please enroll first.")
    if attendance.status not in ("Present", "Absent"):
        raise HTTPException(status_code=400, detail="Status must be Present or Absent.")

    record = (
        db.query(Attendance)
        .filter(Attendance.student_id == student.student_id, Attendance.day == date.today())
        .first()
    )
    if record:
        record.status = attendance.status
        record.method = attendance.method
        record.date = datetime.now()
    else:
        record = Attendance(
            student_id=student.student_id,
            day=date.today(),
            date=datetime.now(),
            status=attendance.status,
            method=attendance.method,
        )
        db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "message": "Attendance saved successfully!",
        "student_name": student.name,
        **attendance_dict(record, student),
    }


@app.get("/api/attendance", dependencies=[Depends(require_auth)])
def list_attendance(day: Optional[date] = None, db: Session = Depends(get_db)):
    query = db.query(Attendance, Student).join(
        Student, Attendance.student_id == Student.student_id
    )
    if day:
        query = query.filter(Attendance.day == day)
    rows = query.order_by(Attendance.date.desc()).all()
    return [attendance_dict(a, s) for a, s in rows]


@app.post("/api/attendance/finish", dependencies=[Depends(require_auth)])
def finish_session(db: Session = Depends(get_db)):
    """End of class: everyone without a record today is marked Absent."""
    today = date.today()
    marked_ids = {
        row[0] for row in db.query(Attendance.student_id).filter(Attendance.day == today).all()
    }
    newly_absent = 0
    for student in db.query(Student).all():
        if student.student_id not in marked_ids:
            db.add(
                Attendance(
                    student_id=student.student_id,
                    day=today,
                    date=datetime.now(),
                    status="Absent",
                    method="Auto (Session End)",
                )
            )
            newly_absent += 1
    db.commit()
    present = db.query(Attendance).filter(
        Attendance.day == today, Attendance.status == "Present"
    ).count()
    return {"present": present, "marked_absent": newly_absent}


@app.get("/api/stats", dependencies=[Depends(require_auth)])
def stats(db: Session = Depends(get_db)):
    today = date.today()
    total = db.query(Student).count()
    present = db.query(Attendance).filter(
        Attendance.day == today, Attendance.status == "Present"
    ).count()
    absent = max(total - present, 0)
    rate = round(present / total * 100) if total else 0

    recent_rows = (
        db.query(Attendance, Student)
        .join(Student, Attendance.student_id == Student.student_id)
        .order_by(Attendance.date.desc())
        .limit(5)
        .all()
    )
    return {
        "total": total,
        "present": present,
        "absent": absent,
        "rate": rate,
        "recent": [attendance_dict(a, s) for a, s in recent_rows],
    }


# ------------------------------------------------------------ static files
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
if FRONTEND_DIR.exists():
    # Serves the website at http://127.0.0.1:8000/
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
