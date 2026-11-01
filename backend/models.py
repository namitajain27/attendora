from datetime import date, datetime

from sqlalchemy import (
    Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)

from database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    course = Column(String(100), nullable=True)
    photo_path = Column(String(255), nullable=True)
    # 128-number face encoding stored as a JSON string
    face_encoding = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False)


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        # one attendance row per student per day (duplicate prevention)
        UniqueConstraint("student_id", "day", name="uq_student_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), ForeignKey("students.student_id"), nullable=False, index=True)
    day = Column(Date, default=date.today, nullable=False, index=True)
    date = Column(DateTime, default=datetime.now, nullable=False)  # exact time marked
    status = Column(String(20), nullable=False, default="Present")
    method = Column(String(50), nullable=False, default="Face Recognition")
