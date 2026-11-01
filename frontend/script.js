/* =====================================================
   ATTENDORA - FRONTEND LOGIC
   One file, split into sections. Each page only runs
   its own section (decided by <body data-page="...">).
   ===================================================== */

/* ---------- Config ---------- */

// When the site is served by FastAPI (http://127.0.0.1:8000) we use the same origin.
// If you open the HTML with Live Server (another port), we talk to the backend on :8000.
const API_BASE = location.port === "8000" || location.protocol === "https:"
    ? ""
    : "http://127.0.0.1:8000";

const TOKEN_KEY = "attendoraToken";
const PAGE = document.body.dataset.page;

/* ---------- Shared helpers ---------- */

function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = "login.html";
}

function goToLogin() {
    window.location.href = getToken() ? "dashboard.html" : "login.html";
}

async function api(path, { method = "GET", json, form, auth = true } = {}) {
    const headers = {};
    let body;

    if (auth && getToken()) headers["Authorization"] = "Bearer " + getToken();
    if (json) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(json);
    } else if (form) {
        body = form; // browser sets multipart headers itself
    }

    let response;
    try {
        response = await fetch(API_BASE + path, { method, headers, body });
    } catch (error) {
        throw new Error("Cannot reach the server. Is the backend running?");
    }

    let data = null;
    try { data = await response.json(); } catch (e) { /* empty body */ }

    if (response.status === 401 && auth) {
        logout();
        throw new Error("Session expired. Please log in again.");
    }
    if (!response.ok) {
        const detail = data && data.detail;
        throw new Error(
            typeof detail === "string" ? detail
            : detail ? JSON.stringify(detail)
            : "Request failed (" + response.status + ")"
        );
    }
    return data;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
}

function initialsOf(name) {
    return String(name || "?").trim().split(/\s+/).map(p => p[0]).join("").substring(0, 2).toUpperCase();
}

function fmtDate(iso) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function photoUrl(path) {
    return path ? API_BASE + "/" + path : null;
}

function setRing(element, percent, withHole = false) {
    if (!element) return;
    const p = Math.max(0, Math.min(100, percent));
    const ring = `conic-gradient(#4f46e5 0 ${p}%, #e5e7eb ${p}% 100%)`;
    element.style.background = withHole
        ? `radial-gradient(circle, white 58%, transparent 59%), ${ring}`
        : ring;
}

let toastTimer = null;
function toast(message, type = "success") {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.className = "toast show " + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

function getBool(key, fallback = true) {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
}

/* ---------- Auth guard ---------- */

if (PAGE !== "home" && PAGE !== "login" && !getToken()) {
    window.location.href = "login.html";
}

/* ---------- Teacher name / mobile menu (all app pages) ---------- */

(function initLayout() {
    const name = localStorage.getItem("attendoraTeacherName") || "Teacher";
    document.querySelectorAll(".js-teacher-name").forEach(el => (el.textContent = name));
    document.querySelectorAll(".js-teacher-initial").forEach(el => (el.textContent = initialsOf(name)[0]));

    const menuButton = document.getElementById("menuButton");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (menuButton && sidebar && overlay) {
        menuButton.addEventListener("click", () => {
            sidebar.classList.toggle("open");
            overlay.classList.toggle("show");
        });
        overlay.addEventListener("click", () => {
            sidebar.classList.remove("open");
            overlay.classList.remove("show");
        });
    }
})();


/* =====================================================
   LOGIN
   ===================================================== */

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        const errorBox = document.getElementById("loginError");
        const button = loginForm.querySelector(".login-button");
        errorBox.textContent = "";
        button.disabled = true;

        try {
            const result = await api("/api/login", {
                method: "POST",
                auth: false,
                json: {
                    teacher_id: document.getElementById("teacherId").value,
                    password: document.getElementById("password").value
                }
            });

            const remember = document.getElementById("rememberMe").checked;
            (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, result.token);
            localStorage.setItem("attendoraTeacherId", result.teacher_id);
            if (!localStorage.getItem("attendoraTeacherName")) {
                localStorage.setItem("attendoraTeacherName", result.teacher_name);
            }
            window.location.href = "dashboard.html";
        } catch (error) {
            errorBox.textContent = error.message;
            button.disabled = false;
        }
    });
}


/* =====================================================
   DASHBOARD
   ===================================================== */

async function initDashboard() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour >= 5 && hour < 12 ? "Good morning!"
        : hour >= 12 && hour < 17 ? "Good afternoon!"
        : hour >= 17 && hour < 21 ? "Good evening!"
        : "Good night!";
    document.getElementById("greeting").textContent = greeting;
    document.getElementById("currentDate").textContent = fmtDate(now);

    try {
        const s = await api("/api/stats");
        const pct = s.total ? Math.round((s.present / s.total) * 100) : 0;

        document.getElementById("statTotal").textContent = s.total;
        document.getElementById("statPresent").textContent = s.present;
        document.getElementById("statPresentPct").textContent = pct + "% of students";
        document.getElementById("statAbsent").textContent = s.absent;
        document.getElementById("statRate").textContent = s.rate + "%";

        document.getElementById("ringPercent").textContent = s.rate + "%";
        document.getElementById("ringPresent").textContent = s.present;
        document.getElementById("ringAbsent").textContent = s.absent;
        document.getElementById("ringTotal").textContent = s.total;
        setRing(document.getElementById("ring"), s.rate);

        const body = document.getElementById("recentBody");
        if (!s.recent.length) {
            body.innerHTML = '<tr><td colspan="4" class="empty-row">No attendance yet. Enroll students and start a session.</td></tr>';
            return;
        }
        body.innerHTML = s.recent.map(r => {
            const present = r.status.toLowerCase() === "present";
            return `<tr>
                <td><div class="student-cell">
                    <div class="student-avatar">${escapeHtml(initialsOf(r.name))}</div>
                    <strong>${escapeHtml(r.name)}</strong></div></td>
                <td>${escapeHtml(r.student_id)}</td>
                <td><span class="table-status ${present ? "present-status" : "absent-status"}">${escapeHtml(r.status)}</span></td>
                <td>${present ? fmtTime(r.date) : "—"}</td>
            </tr>`;
        }).join("");
    } catch (error) {
        document.getElementById("recentBody").innerHTML =
            `<tr><td colspan="4" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    }
}


/* =====================================================
   ENROLLMENT
   ===================================================== */

let enrollStream = null;
let capturedFaceImage = null; // data URL of the photo to enroll

function initEnrollment() {
    const form = document.getElementById("enrollmentForm");
    const video = document.getElementById("cameraPreview");
    const placeholder = document.getElementById("cameraPlaceholder");
    const startBtn = document.getElementById("startCameraButton");
    const captureBtn = document.getElementById("captureButton");
    const retakeBtn = document.getElementById("retakeButton");
    const uploadBtn = document.getElementById("uploadButton");
    const fileInput = document.getElementById("studentPhoto");
    const photoBox = document.getElementById("capturedPhoto");
    const photoImg = document.getElementById("capturedImage");
    const successBox = document.getElementById("enrollmentSuccess");

    async function openCamera() {
        try {
            enrollStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" }, audio: false
            });
            video.srcObject = enrollStream;
            video.style.display = "block";
            placeholder.style.display = "none";
            captureBtn.disabled = false;
            retakeBtn.disabled = true;
            startBtn.textContent = "✓ Camera Active";
            startBtn.disabled = true;
        } catch (error) {
            toast("Camera access was blocked. Allow camera permission or upload a photo.", "error");
        }
    }

    function closeCamera() {
        if (enrollStream) {
            enrollStream.getTracks().forEach(t => t.stop());
            enrollStream = null;
        }
        video.srcObject = null;
        video.style.display = "none";
        placeholder.style.display = "flex";
        startBtn.textContent = "📷 Start Camera";
        startBtn.disabled = false;
        captureBtn.disabled = true;
    }

    function showPhoto(dataUrl) {
        capturedFaceImage = dataUrl;
        photoImg.src = dataUrl;
        photoBox.classList.add("show");
        successBox.classList.remove("show");
    }

    startBtn.addEventListener("click", openCamera);

    captureBtn.addEventListener("click", () => {
        if (!enrollStream || !video.videoWidth) {
            toast("Camera is not ready yet.", "error");
            return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        showPhoto(canvas.toDataURL("image/jpeg", 0.92));
        closeCamera();
        retakeBtn.disabled = false;
    });

    retakeBtn.addEventListener("click", () => {
        capturedFaceImage = null;
        photoBox.classList.remove("show");
        retakeBtn.disabled = true;
        openCamera();
    });

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            closeCamera();
            showPhoto(e.target.result);
            retakeBtn.disabled = true;
        };
        reader.readAsDataURL(file);
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (!capturedFaceImage) {
            toast("Please capture or upload the student's face photo first.", "error");
            return;
        }

        const button = document.getElementById("enrollStudentButton");
        button.disabled = true;
        button.textContent = "Registering face...";

        try {
            const photoBlob = await (await fetch(capturedFaceImage)).blob();
            const data = new FormData();
            data.append("student_id", document.getElementById("studentId").value.trim());
            data.append("name", document.getElementById("studentName").value.trim());
            data.append("course", document.getElementById("course").value.trim());
            data.append("photo", photoBlob, "student-photo.jpg");

            const student = await api("/api/students", { method: "POST", form: data });

            document.getElementById("enrollmentSuccessText").textContent =
                `${student.name} (${student.student_id}) is ready for face attendance.`;
            successBox.classList.add("show");
            toast("Student enrolled successfully!");

            form.reset();
            capturedFaceImage = null;
            photoBox.classList.remove("show");
            fileInput.value = "";
            loadEnrolledStudents();
        } catch (error) {
            toast(error.message, "error");
        } finally {
            button.disabled = false;
            button.textContent = "Enroll Student";
        }
    });

    loadEnrolledStudents();
}

async function loadEnrolledStudents() {
    const body = document.getElementById("enrolledBody");
    const count = document.getElementById("enrolledCount");
    try {
        const students = await api("/api/students");
        count.textContent = `${students.length} student${students.length === 1 ? "" : "s"} registered`;

        if (!students.length) {
            body.innerHTML = '<tr><td colspan="5" class="empty-row">No students enrolled yet.</td></tr>';
            return;
        }

        body.innerHTML = students.map(s => {
            const img = photoUrl(s.photo_path);
            const avatar = img
                ? `<img class="student-record-avatar-img" src="${escapeHtml(img)}" alt="">`
                : `<div class="student-record-avatar">${escapeHtml(initialsOf(s.name))}</div>`;
            return `<tr>
                <td><div class="student-record">${avatar}<div><strong>${escapeHtml(s.name)}</strong></div></div></td>
                <td>${escapeHtml(s.student_id)}</td>
                <td>${escapeHtml(s.course || "—")}</td>
                <td><span class="status-badge ${s.has_face ? "present" : "absent"}">${s.has_face ? "Registered" : "Missing"}</span></td>
                <td><button class="delete-student-button" data-id="${escapeHtml(s.student_id)}" data-name="${escapeHtml(s.name)}">Delete</button></td>
            </tr>`;
        }).join("");

        body.querySelectorAll(".delete-student-button").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm(`Delete ${btn.dataset.name} and all their attendance records?`)) return;
                try {
                    await api("/api/students/" + encodeURIComponent(btn.dataset.id), { method: "DELETE" });
                    toast("Student deleted.");
                    loadEnrolledStudents();
                } catch (error) {
                    toast(error.message, "error");
                }
            });
        });
    } catch (error) {
        body.innerHTML = `<tr><td colspan="5" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    }
}


/* =====================================================
   ATTENDANCE (live face recognition)
   ===================================================== */

const QUALITY = {
    high: { width: 1280, height: 720 },
    medium: { width: 640, height: 480 },
    low: { width: 320, height: 240 }
};

let attStream = null;
let attTimer = null;
let attBusy = false;
const sessionSeen = new Set();

function setRecognitionStatus(title, text, state = "") {
    const box = document.getElementById("recognitionStatus");
    box.className = "recognition-status " + state;
    box.innerHTML = `<div class="recognition-dot"></div>
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

async function loadTodaySummary() {
    try {
        const s = await api("/api/stats");
        document.getElementById("summaryPercent").textContent = s.rate + "%";
        document.getElementById("summaryPresent").textContent = s.present;
        document.getElementById("summaryAbsent").textContent = s.absent;
        document.getElementById("summaryTotal").textContent = s.total;
        setRing(document.getElementById("summaryRing"), s.rate, true);
    } catch (error) { /* shown elsewhere */ }
}

function addRecognized(match) {
    const list = document.getElementById("recognizedList");
    document.getElementById("recognizedEmpty").style.display = "none";

    const confirmNeeded = !match.newly_marked && !match.already_marked;
    const item = document.createElement("div");
    item.className = "recognized-student";
    item.dataset.id = match.student_id;
    item.innerHTML = `
        <div class="recognized-student-info">
            <div class="recognized-avatar">${escapeHtml(initialsOf(match.name))}</div>
            <div>
                <strong>${escapeHtml(match.name)}</strong>
                <span>${escapeHtml(match.student_id)} · ${escapeHtml(match.course || "—")} · ${match.confidence}% match</span>
            </div>
        </div>
        <div class="recognized-student-right">
            <span class="recognized-time">${fmtTime(new Date())}</span>
            ${confirmNeeded
                ? '<button class="confirm-button">Mark Present</button>'
                : `<span class="present-badge">${match.already_marked ? "ALREADY PRESENT" : "PRESENT"}</span>`}
        </div>`;
    list.prepend(item);

    const btn = item.querySelector(".confirm-button");
    if (btn) {
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            try {
                await api("/api/attendance", {
                    method: "POST",
                    json: { student_id: match.student_id, status: "Present", method: "Face Recognition" }
                });
                btn.outerHTML = '<span class="present-badge">PRESENT</span>';
                loadTodaySummary();
            } catch (error) {
                btn.disabled = false;
                toast(error.message, "error");
            }
        });
    }
}

async function recognizeFrame() {
    const video = document.getElementById("attendanceCamera");
    if (attBusy || !attStream || !video.videoWidth) return;
    attBusy = true;

    try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));

        const form = new FormData();
        form.append("image", blob, "frame.jpg");
        form.append("mark", getBool("automaticAttendance", true) ? "true" : "false");

        const result = await api("/api/recognize", { method: "POST", form });
        if (!attStream) return; // camera was stopped while waiting

        if (result.faces_detected === 0) {
            setRecognitionStatus("No face detected", "Move closer and face the camera.", "active");
        } else if (result.matches.length === 0) {
            setRecognitionStatus("Face not recognized", "This student may not be enrolled.", "error");
        } else {
            const names = result.matches.map(m => m.name).join(", ");
            setRecognitionStatus("Recognized: " + names, "Looking for more students...", "found");

            let anyNew = false;
            result.matches.forEach(match => {
                if (sessionSeen.has(match.student_id)) return;
                sessionSeen.add(match.student_id);
                addRecognized(match);
                if (match.newly_marked) anyNew = true;
                if (getBool("recognitionNotifications", true)) {
                    toast(`${match.name} recognized`);
                }
            });
            if (anyNew) loadTodaySummary();
        }
    } catch (error) {
        setRecognitionStatus("Recognition problem", error.message, "error");
    } finally {
        attBusy = false;
    }
}

function stopAttendanceCamera() {
    clearInterval(attTimer);
    attTimer = null;
    if (attStream) {
        attStream.getTracks().forEach(t => t.stop());
        attStream = null;
    }
    const video = document.getElementById("attendanceCamera");
    video.srcObject = null;
    video.style.display = "none";
    document.getElementById("attendancePlaceholder").style.display = "flex";
    document.getElementById("faceFrame").style.display = "none";

    const status = document.getElementById("cameraStatus");
    status.innerHTML = "<span></span> Camera Off";
    status.classList.remove("camera-active");

    document.getElementById("startAttendanceCamera").disabled = false;
    document.getElementById("stopAttendanceCamera").disabled = true;
    setRecognitionStatus("Recognition inactive", "Start the camera to begin face recognition.");
}

function initAttendance() {
    const video = document.getElementById("attendanceCamera");
    document.getElementById("attendanceDate").textContent = fmtDate(new Date());
    loadTodaySummary();

    document.getElementById("startAttendanceCamera").addEventListener("click", async () => {
        try {
            const q = QUALITY[localStorage.getItem("cameraQuality")] || QUALITY.medium;
            attStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: q.width }, height: { ideal: q.height } },
                audio: false
            });
            video.srcObject = attStream;
            video.style.display = "block";
            document.getElementById("attendancePlaceholder").style.display = "none";
            document.getElementById("faceFrame").style.display = "flex";

            const status = document.getElementById("cameraStatus");
            status.innerHTML = "<span></span> Camera Active";
            status.classList.add("camera-active");

            document.getElementById("startAttendanceCamera").disabled = true;
            document.getElementById("stopAttendanceCamera").disabled = false;
            setRecognitionStatus("Recognition active", "Looking for registered students...", "active");

            attTimer = setInterval(recognizeFrame, 1500);
        } catch (error) {
            toast("Unable to access the camera. Please allow camera permission.", "error");
        }
    });

    document.getElementById("stopAttendanceCamera").addEventListener("click", stopAttendanceCamera);

    document.getElementById("manualAttendance").addEventListener("click", async () => {
        const studentId = prompt("Enter the Student ID to mark Present:");
        if (!studentId || !studentId.trim()) return;
        try {
            const result = await api("/api/attendance", {
                method: "POST",
                json: { student_id: studentId.trim(), status: "Present", method: "Manual Entry" }
            });
            toast(`${result.student_name} marked Present.`);
            loadTodaySummary();
        } catch (error) {
            toast(error.message, "error");
        }
    });

    const finishBtn = document.getElementById("finishSession");
    finishBtn.addEventListener("click", async () => {
        if (!confirm("Finish the session? Students who are not present will be marked Absent for today.")) return;
        finishBtn.disabled = true;
        try {
            stopAttendanceCamera();
            const result = await api("/api/attendance/finish", { method: "POST" });
            const msg = document.getElementById("sessionMessage");
            msg.textContent = `Session completed: ${result.present} present, ${result.marked_absent} marked absent.`;
            msg.classList.add("show");
            msg.scrollIntoView({ behavior: "smooth", block: "center" });
            loadTodaySummary();
        } catch (error) {
            toast(error.message, "error");
        } finally {
            finishBtn.disabled = false;
        }
    });
}


/* =====================================================
   RECORDS
   ===================================================== */

const PAGE_SIZE = 10;
let allRecords = [];
let filteredRecords = [];
let currentPage = 1;

function applyRecordFilters() {
    const search = document.getElementById("recordSearch").value.toLowerCase().trim();
    const status = document.getElementById("recordStatusFilter").value;
    const day = document.getElementById("recordDateFilter").value; // YYYY-MM-DD

    filteredRecords = allRecords.filter(r => {
        const matchSearch = !search ||
            r.name.toLowerCase().includes(search) ||
            r.student_id.toLowerCase().includes(search) ||
            (r.course || "").toLowerCase().includes(search);
        const matchStatus = status === "all" || r.status.toLowerCase() === status;
        const matchDay = !day || String(r.date).slice(0, 10) === day;
        return matchSearch && matchStatus && matchDay;
    });
    currentPage = 1;
    renderRecords();
}

function renderRecords() {
    const body = document.getElementById("recordsTableBody");
    const total = filteredRecords.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(currentPage, pages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = filteredRecords.slice(start, start + PAGE_SIZE);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-row">No attendance records found.</td></tr>';
    } else {
        body.innerHTML = rows.map(r => `<tr>
            <td><div class="student-record">
                <div class="student-record-avatar">${escapeHtml(initialsOf(r.name))}</div>
                <div><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.course || "—")}</span></div>
            </div></td>
            <td>${escapeHtml(r.student_id)}</td>
            <td>${fmtDate(r.date)}</td>
            <td>${fmtTime(r.date)}</td>
            <td><span class="status-badge ${r.status.toLowerCase()}">${escapeHtml(r.status)}</span></td>
            <td><span class="method-badge">${escapeHtml(r.method || "—")}</span></td>
        </tr>`).join("");
    }

    document.getElementById("recordsCount").textContent =
        total ? `Showing ${start + 1}-${start + rows.length} of ${total} records` : "Showing 0 records";

    const pager = document.getElementById("pagination");
    let html = `<button data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>←</button>`;
    for (let p = 1; p <= pages; p++) {
        if (pages > 7 && p !== 1 && p !== pages && Math.abs(p - currentPage) > 1) {
            if (p === 2 || p === pages - 1) html += "<button disabled>…</button>";
            continue;
        }
        html += `<button data-page="${p}" class="${p === currentPage ? "active" : ""}">${p}</button>`;
    }
    html += `<button data-page="${currentPage + 1}" ${currentPage === pages ? "disabled" : ""}>→</button>`;
    pager.innerHTML = html;
    pager.querySelectorAll("button[data-page]").forEach(btn => {
        btn.addEventListener("click", () => {
            currentPage = Number(btn.dataset.page);
            renderRecords();
        });
    });
}

function exportRecordsCsv() {
    if (!filteredRecords.length) {
        toast("No records to export.", "error");
        return;
    }
    const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Student", "Student ID", "Course", "Date", "Time", "Status", "Method"].map(cell).join(",")];
    filteredRecords.forEach(r => {
        lines.push([r.name, r.student_id, r.course, String(r.date).slice(0, 10), fmtTime(r.date), r.status, r.method]
            .map(cell).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "attendance-records.csv";
    link.click();
    URL.revokeObjectURL(link.href);
}

async function initRecords() {
    document.getElementById("recordSearch").addEventListener("input", applyRecordFilters);
    document.getElementById("recordStatusFilter").addEventListener("change", applyRecordFilters);
    document.getElementById("recordDateFilter").addEventListener("change", applyRecordFilters);
    document.getElementById("exportRecordsButton").addEventListener("click", exportRecordsCsv);

    try {
        const [stats, records] = await Promise.all([api("/api/stats"), api("/api/attendance")]);
        document.getElementById("totalStudentsCount").textContent = stats.total;
        document.getElementById("presentTodayCount").textContent = stats.present;
        document.getElementById("absentTodayCount").textContent = stats.absent;
        document.getElementById("attendanceRateCount").textContent = stats.rate + "%";
        allRecords = records;
        applyRecordFilters();
    } catch (error) {
        document.getElementById("recordsTableBody").innerHTML =
            `<tr><td colspan="6" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    }
}


/* =====================================================
   SETTINGS (saved in this browser only)
   ===================================================== */

async function initSettings() {
    const get = (k, d = "") => localStorage.getItem(k) ?? d;

    document.getElementById("teacherName").value = get("attendoraTeacherName", "Teacher");
    document.getElementById("teacherIdSettings").value = get("attendoraTeacherId", "");
    document.getElementById("teacherEmail").value = get("attendoraTeacherEmail", "");
    document.getElementById("automaticAttendance").checked = getBool("automaticAttendance", true);
    document.getElementById("recognitionNotifications").checked = getBool("recognitionNotifications", true);
    document.getElementById("cameraQuality").value = get("cameraQuality", "medium");

    document.getElementById("saveProfileButton").addEventListener("click", () => {
        const name = document.getElementById("teacherName").value.trim();
        if (!name) {
            toast("Please enter your name.", "error");
            return;
        }
        localStorage.setItem("attendoraTeacherName", name);
        localStorage.setItem("attendoraTeacherEmail", document.getElementById("teacherEmail").value.trim());
        localStorage.setItem("automaticAttendance", document.getElementById("automaticAttendance").checked);
        localStorage.setItem("recognitionNotifications", document.getElementById("recognitionNotifications").checked);
        localStorage.setItem("cameraQuality", document.getElementById("cameraQuality").value);

        document.querySelectorAll(".js-teacher-name").forEach(el => (el.textContent = name));
        document.querySelectorAll(".js-teacher-initial").forEach(el => (el.textContent = initialsOf(name)[0]));

        const ok = document.getElementById("settingsSuccess");
        ok.classList.add("show");
        setTimeout(() => ok.classList.remove("show"), 2500);
    });

    try {
        await api("/api/health", { auth: false });
        document.getElementById("backendStatus").textContent = "Connected";
    } catch (error) {
        document.getElementById("backendStatus").textContent = "Offline";
    }
}


/* ---------- Start the right section ---------- */

if (PAGE === "dashboard") initDashboard();
if (PAGE === "enrollment") initEnrollment();
if (PAGE === "attendance") initAttendance();
if (PAGE === "records") initRecords();
if (PAGE === "settings") initSettings();
