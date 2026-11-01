# Attendora – Student Face Attendance System

A web-based smart attendance system. Teachers enroll students with a face photo, then take attendance by simply pointing a webcam at the class – recognized students are marked **Present** automatically, and everyone else is marked **Absent** when the session ends.

## Features

- 🔐 Teacher login (token based)
- 👤 Student enrollment with webcam capture or photo upload (one clear face required)
- 🎯 Live face recognition from the browser camera (multiple students per frame)
- 🚫 Duplicate prevention – one attendance record per student per day
- 🧑‍🏫 Manual attendance fallback and "confirm before marking" mode
- 📊 Dashboard with today's present / absent / rate and recent activity
- 📁 Attendance records with search, status filter, date filter, pagination and CSV export
- 📱 Responsive UI (works on mobile too)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Python, FastAPI, SQLAlchemy |
| Face recognition | `face_recognition` (dlib), OpenCV-free, Pillow, NumPy |
| Database | PostgreSQL (or SQLite – zero setup) |

## Project Structure

```
attendora/
├── backend/
│   ├── main.py            # FastAPI app: auth, students, recognition, attendance
│   ├── face_utils.py      # face encoding & matching helpers
│   ├── models.py          # Student, Attendance tables
│   ├── database.py        # DB connection (.env)
│   ├── create_tables.py   # create / reset tables
│   ├── test_db.py         # check DB connection
│   ├── requirements.txt
│   ├── .env.example
│   └── uploads/           # student photos (git-ignored)
├── frontend/
│   ├── index.html  login.html  dashboard.html
│   ├── enrollment.html  attendance.html  record.html  setting.html
│   ├── style.css
│   └── script.js
├── LICENSE
└── README.md
```

## Setup

### 1. Clone and create a virtual environment

```bash
git clone https://github.com/<your-username>/attendora.git
cd attendora/backend

python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
pip install face_recognition --no-deps
```

> `requirements.txt` installs `dlib-bin` (a pre-built dlib), so you **don't** need CMake or Visual Studio.
> `face_recognition` is installed with `--no-deps` so pip doesn't try to compile dlib itself.

### 3. Configure

```bash
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env`:

- Leave `DATABASE_URL` empty to use SQLite, **or** set PostgreSQL:
  `DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/attendora`
- Change `TEACHER_ID`, `TEACHER_PASSWORD` and `SECRET_KEY`.

(For PostgreSQL create the database first: `CREATE DATABASE attendora;`)

### 4. Create tables and run

```bash
python test_db.py          # optional: check the connection
python create_tables.py    # creates tables
uvicorn main:app --reload
```

Open **http://127.0.0.1:8000** – the backend also serves the website.
Login with the Teacher ID / password from your `.env` (defaults: `TCH001` / `admin123`).

> ⚠️ Camera access works on `localhost` / `127.0.0.1` or HTTPS only.

## How to use

1. **Enrollment** → enter ID, name, course → capture/upload a clear photo → *Enroll Student*.
2. **Attendance** → *Start Camera*. Students who look at the camera are recognized and marked Present.
3. Click **Finish Session** → everyone not recognized is marked Absent for today.
4. **Records** → search, filter by date/status, export CSV.

## Configuration reference

| Variable | Default | Meaning |
|----------|---------|---------|
| `DATABASE_URL` | SQLite file | PostgreSQL / SQLite connection URL |
| `TEACHER_ID` / `TEACHER_PASSWORD` / `TEACHER_NAME` | `TCH001` / `admin123` / `Teacher` | Login credentials |
| `SECRET_KEY` | – | Signs login tokens. Use a long random string |
| `TOKEN_HOURS` | `12` | Login validity |
| `FACE_TOLERANCE` | `0.5` | Match strictness. Lower = stricter (fewer false matches) |

## API overview

All endpoints except `/api/login` and `/api/health` need `Authorization: Bearer <token>`.
Interactive docs: **http://127.0.0.1:8000/docs**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/login` | Get a token |
| GET | `/api/students` | List students |
| POST | `/api/students` | Enroll (multipart: `student_id`, `name`, `course`, `photo`) |
| DELETE | `/api/students/{id}` | Delete student + records |
| POST | `/api/recognize` | Send a camera frame (`image`, `mark`) → matches |
| POST | `/api/attendance` | Manual attendance |
| GET | `/api/attendance?day=YYYY-MM-DD` | List records |
| POST | `/api/attendance/finish` | Mark remaining students Absent |
| GET | `/api/stats` | Today's numbers + recent activity |

## Upgrading from an older version

Earlier versions stored students without face data. The tables changed, so run once:

```bash
python create_tables.py --reset     # WARNING: deletes existing data
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Please install face_recognition_models` | `pip install "setuptools<81" face_recognition_models` |
| Camera does not start | Allow camera permission; use `127.0.0.1` or HTTPS |
| "Face not recognized" | Better lighting, face the camera, or raise `FACE_TOLERANCE` slightly (e.g. 0.55) |
| Wrong person matched | Lower `FACE_TOLERANCE` (e.g. 0.45) and re-enroll with a clearer photo |
| Opening HTML with Live Server | Works – the frontend then calls the API on port 8000 |

## Security notes

This is a college-project level system. Before real deployment: use HTTPS, set a strong `SECRET_KEY` and password, restrict CORS origins in `main.py`, and protect the `uploads/` folder (student photos are personal data).

## License

MIT – see [LICENSE](LICENSE).
