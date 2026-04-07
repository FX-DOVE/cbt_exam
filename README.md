## CBT Exam App (LAN / Local Wi‑Fi)

Full-stack CBT exam system that runs on **one host laptop** and is accessible from **other devices on the same Wi‑Fi** using the host laptop’s **local IP** (not `localhost`).

### Tech

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **DB**: MongoDB (running on host laptop)
- **Auth**: JWT, bcrypt
- **Uploads**: Excel (`.xlsx`) via `xlsx`

---

## 1) Prerequisites (host laptop)

- Node.js 18+ installed
- MongoDB Community Server installed and running
  - Ensure MongoDB is listening on `127.0.0.1:27017`
- Same Wi‑Fi network for all devices

---

## 2) Project structure

```
cbt/
  backend/
  frontend/
  .env.example
  README.md
```

---

## 3) Setup (host laptop)

### A) Backend setup

From `cbt/`:

```bash
cd backend
npm install
```

Create `backend/.env` by copying from `.env.example`:

- Set `JWT_SECRET`
- Set `CORS_ORIGINS` to include:
  - `http://localhost:5173`
  - `http://<YOUR_HOST_LAPTOP_IP>:5173`

Start backend (binds to `0.0.0.0`):

```bash
npm run dev
```

Backend will be available on:

- `http://localhost:5000`
- `http://<YOUR_HOST_LAPTOP_IP>:5000` (for other devices)

### B) Frontend setup

Open a new terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://<YOUR_HOST_LAPTOP_IP>:5000
```

Start frontend (binds to `0.0.0.0`):

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

Frontend will be available on:

- `http://localhost:5173`
- `http://<YOUR_HOST_LAPTOP_IP>:5173` (for other devices)

---

## 4) Finding your host laptop IP (Windows)

Run:

```powershell
ipconfig
```

Look for your Wi‑Fi adapter’s **IPv4 Address**, e.g. `192.168.1.50`.

---

## 5) Default admin login

On first backend start, the server seeds an admin user (if missing):

- Email: from `SEED_ADMIN_EMAIL` (default `admin@cbt.local`)
- Password: from `SEED_ADMIN_PASSWORD` (default `Admin123!`)

Login at the app, then open **Admin Panel**.

---

## 6) Excel formats

### Students Excel columns

Required columns (header row):

- `firstName`, `surname`, `middleName`, `email`, `password`, `phoneNumber`, `subjects`

Optional column:

- `gender` — `male` or `female` (leave blank to skip)

Notes:

- `subjects` should be comma-separated, e.g. `Math,English,Biology`
- `password` will be **hashed** on import
- Students are upserted by `email`

### Questions Excel (subject-based worksheets)

**Recommended:** one **worksheet per subject**. The **tab name** becomes the question `subject` in the database (e.g. sheets `maths`, `english`, `biology`).

On each subject sheet, use these columns (no `subject` column needed):

- `questionText`, `optionA`, `optionB`, `optionC`, `optionD`, `correctAnswer`

**Legacy:** a single sheet may include a `subject` column plus the columns above; each row’s `subject` is used instead of the tab name.

Notes:

- `correctAnswer` must be one of: `A`, `B`, `C`, `D` (case-insensitive)
- Student `subjects` in the student import must **match the subject/tab names** you use here (same spelling), or those questions will not appear for that student

---

## 7) Exam rules

- Exam duration is **2 hours** from the moment a student clicks **Start Exam**
- Timer is **persisted** server-side and survives refresh
- Answers are **auto-saved**
- Exam is **auto-submitted** when time ends
- **Retakes are blocked** after submission unless an admin resets the student

---

## 8) Troubleshooting LAN access

- Use `0.0.0.0` bind (already configured) but always browse using the host’s IP
- Allow Node/Vite through Windows Firewall (Private network)
- In **development**, the backend also allows browser requests from **private LAN** origins (e.g. `http://192.168.x.x:5173`) so your Wi‑Fi IP can change without editing `.env`.
- If you open the app from **another device** (phone/tablet), set `VITE_API_BASE_URL` to `http://<HOST_LAPTOP_IP>:5000` (not `127.0.0.1`, which would point at the phone itself).

