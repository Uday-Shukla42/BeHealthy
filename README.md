# BeHealthy

A clinic appointment platform with separate portals for patients, doctors, and admins. Patients book slots and describe their symptoms up front, doctors get an AI-generated pre-visit brief, and both sides stay in the loop through email and Google Calendar.

## Stack

- **Backend:** Node.js, Express, PostgreSQL via Prisma
- **Frontend:** React (Vite)
- **LLM:** Anthropic API (Claude) for pre-visit and post-visit summaries
- **Email:** Nodemailer over SMTP (works with SendGrid, Mailgun, or a Gmail app password)
- **Calendar:** Google Calendar API, OAuth 2.0
- **Background jobs:** node-cron, for medication reminders and retrying failed emails

## Project layout

```
BeHealthy/
  backend/
    prisma/schema.prisma      # DB models
    prisma/seed.js            # creates a starter admin login
    src/
      config/                 # db connection
      controllers/            # route handlers, one per domain
      middleware/              # auth + error handling
      routes/
      services/                # llm, email, calendar, reminder cron
      utils/                   # slot generation helpers
      server.js
  frontend/
    src/
      pages/                   # Login, Register, dashboards, booking flow
      context/AuthContext.jsx
      api/client.js
  SYSTEM_DESIGN.md
```

## Setup

### 1. Database

Any Postgres instance works. For a free option, spin one up on [Neon](https://neon.tech) or [Railway](https://railway.app) and copy the connection string.

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, SMTP_*, GOOGLE_*
npm install
npx prisma migrate dev --name init
npm run seed               # creates admin@behealthy.local / ChangeMe123!
npm run dev                 # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env       # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                 # http://localhost:5173
```

Log in as the seeded admin, create a doctor account from the Admin dashboard, then register a patient account to try the booking flow end to end.

## .env reference (backend)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signing key for auth tokens |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | LLM summaries |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | Outgoing email |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Calendar OAuth |
| `SLOT_HOLD_MINUTES` | How long a slot is reserved while a patient fills the symptom form (default 5) |

## Google Calendar setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Under **OAuth consent screen**, add your test users (or publish the app if you want any Google account to work).
3. Under **Credentials**, create an **OAuth client ID** of type "Web application". Add `http://localhost:4000/api/auth/google/callback` as an authorized redirect URI.
4. Copy the client ID/secret into `.env`.
5. From the app, a logged-in user hits `GET /api/auth/google/connect` to get a consent URL, approves access, and Google redirects to the callback route, which stores their refresh token. From then on, booking an appointment automatically creates calendar events for that user.

Users who never connect their calendar still get full functionality — `calendarService` treats a missing refresh token as a no-op rather than an error.

## API overview

| Method & path | Who | Purpose |
|---|---|---|
| `POST /api/auth/register` | anyone | Create a patient account |
| `POST /api/auth/login` | anyone | Get a JWT |
| `GET /api/auth/google/connect` | logged in | Get Google OAuth consent URL |
| `GET /api/doctors?specialization=` | anyone | Search doctors |
| `GET /api/appointments/available-slots?doctorId=&date=` | anyone | Free slots for a day |
| `POST /api/appointments/hold` | patient | Reserve a slot briefly |
| `POST /api/appointments/:id/confirm` | patient | Submit symptoms, confirm booking |
| `POST /api/appointments/:id/cancel` | patient/doctor/admin | Cancel |
| `POST /api/appointments/:id/post-visit` | doctor | Submit notes + prescription |
| `GET /api/doctors/me/appointments` | doctor | Doctor's upcoming/completed visits |
| `GET /api/patients/me/appointments` | patient | Patient's appointment history |
| `POST /api/admin/doctors` | admin | Create a doctor profile + login |
| `PATCH /api/admin/doctors/:id` | admin | Edit specialization/hours/slot length |
| `POST /api/admin/doctors/:id/leave` | admin | Mark a leave day, auto-cancels conflicts |

## Database schema

See `backend/prisma/schema.prisma` for the full definitions. Core tables:

- **User** — role-based (`PATIENT` / `DOCTOR` / `ADMIN`), holds Google OAuth tokens if connected.
- **DoctorProfile** — specialization, slot duration, working hours (JSON per weekday).
- **DoctorLeave** — one row per doctor per leave date, unique on `(doctorId, date)`.
- **Appointment** — the central table. `status` moves `HELD → CONFIRMED → COMPLETED` (or `CANCELLED`/`NO_SHOW`). Unique on `(doctorId, slotStart)` so the database itself refuses a double-booked slot. Stores the symptom text, structured `preVisitSummary`, clinical notes, `prescription`, and the generated `postVisitSummary`.
- **MedicationReminder** — one row per scheduled dose, generated from the prescription when a doctor completes a visit.
- **Notification** — a log of every email attempt (`PENDING/SENT/FAILED`) so failures can be retried by the cron job.

## LLM prompts

**Pre-visit summary** (`llmService.generatePreVisitSummary`):
> Analyse these symptoms and return ONLY a JSON object with: urgency level (Low/Medium/High), chief complaint, and three suggested questions for the doctor.

**Post-visit summary** (`llmService.generatePostVisitSummary`):
> Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps.

Both calls are wrapped so a timeout, rate limit, or malformed response never blocks the booking or visit-completion flow — see `SYSTEM_DESIGN.md` for the fallback behavior.

## Notes

This is a functional reference implementation covering every requirement in the assignment brief, not a production deployment — before going live you'd want proper input validation (zod schemas are stubbed in but not wired into every route), refresh-token rotation for JWTs, and a real transactional outbox instead of the simple Notification-table retry loop.
