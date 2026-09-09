# Aurocode SyncUp — Proposal Manager

A simple, production-ready application for sharing project proposals with clients,
styled after the [aurocode.in](https://aurocode.in) brand. Admins manage proposals,
tasks, comments, attachments and client accounts. Clients get a read-only portal
where they can follow progress and leave comments.

Highlights:

- **In-app notifications** — a bell in the top bar with an unread badge. Clients are
  notified about status changes, task updates, new files and admin replies; admins
  are notified when a client comments.
- **Multi-session logins** — sign in from several devices at once; the Profile page
  lists active sessions (device, IP, last active) and lets you revoke any of them
  or sign out all other devices. Revoked tokens stop working immediately.
- **Built-in chat** — a Messages page where the freelancer and each client have a
  private conversation (per-client threads for the admin, unread badges in the
  sidebar, near-real-time updates via polling).
- **Activity timeline**, role-based access enforced server-side, file attachments,
  search/filter/pagination throughout.

## Tech Stack

| Layer     | Technology |
|-----------|------------|
| Backend   | FastAPI · SQLAlchemy · Alembic · Pydantic · JWT |
| Database  | SQLite (development) · PostgreSQL (production) |
| Frontend  | React · Vite · TypeScript · TailwindCSS · React Query · React Router |
| Deploy    | Docker Compose (nginx serves the frontend and proxies `/api` to the backend) |

## Quick Start (Docker)

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

Migrations run and demo data is seeded automatically on first start.

If port 3000 is already in use, pick another one:

```bash
APP_PORT=3210 docker compose up --build
```

### Demo accounts

| Role   | Username  | Password      |
|--------|-----------|---------------|
| Admin  | `admin`   | `admin123`    |
| Client | `client1` | `password123` |
| Client | `client2` | `password123` |

> Set a real `SECRET_KEY` before deploying anywhere public:
> `SECRET_KEY=$(openssl rand -hex 32) docker compose up --build`

## Local Development (without Docker)

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional — sensible defaults are built in
alembic upgrade head          # creates the SQLite database
python seed.py                # demo accounts + sample proposal
uvicorn main:app --reload     # http://localhost:8000
```

API docs are available at http://localhost:8000/docs.

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :8000)
```

## Roles & Permissions

| Capability                  | Admin | Client |
|-----------------------------|:-----:|:------:|
| View proposals / tasks / timeline / attachments | ✅ | ✅ (own projects only) |
| Add comments                | ✅ | ✅ |
| Create / edit / delete proposals | ✅ | ❌ |
| Create / edit / delete tasks, change status & priority | ✅ | ❌ |
| Delete comments             | ✅ | ❌ |
| Upload / delete attachments | ✅ | ❌ (download only) |
| Manage client accounts      | ✅ | ❌ |

Authorization is enforced server-side on every endpoint — the UI simply hides
what a role cannot do.

## Project Structure

```
backend/
  app/
    main.py            FastAPI app, CORS, router registration
    config.py          Environment-driven settings
    database.py        Engine, session, declarative base
    models.py          SQLAlchemy models (users, projects, tasks, comments,
                       attachments, activity_logs)
    schemas.py         Pydantic request/response schemas
    security.py        Password hashing + JWT helpers
    deps.py            Auth dependencies and role guards
    services/
      activity.py      Activity log helper
    routers/           One router per module (auth, users, dashboard,
                       projects, tasks, comments, attachments, activity)
  alembic/             Migrations (0001_initial)
  seed.py              Idempotent demo data
  entrypoint.sh        migrate → seed → uvicorn (used by Docker)
frontend/
  src/
    lib/               API client, auth context, formatters
    components/        Layout, badges, modals, progress bar, pagination…
    pages/             Login, Dashboard, Projects, ProjectDetail, Tasks,
                       Comments, Clients (admin), Profile
docker-compose.yml     db (PostgreSQL) + backend + frontend (nginx)
```

## API Overview

All endpoints live under `/api` and require a `Bearer` token except `POST /api/auth/login`.

| Method | Endpoint | Access |
|--------|----------|--------|
| POST   | `/auth/login`, `/auth/logout` | all |
| GET    | `/auth/me` | all |
| GET    | `/dashboard` | all (scoped) |
| GET    | `/projects` · `/projects/{id}` | all (scoped) — supports `search`, `status`, `page`, `page_size` |
| POST/PUT/DELETE | `/projects…` | admin |
| GET    | `/tasks` · `/projects/{id}/tasks` | all (scoped) — supports `search`, `status`, `priority`, pagination |
| POST/PUT/DELETE | `/tasks…` | admin |
| GET    | `/comments` · `/projects/{id}/comments` | all (scoped) |
| POST   | `/projects/{id}/comments` | all |
| PUT/DELETE | `/comments/{id}` | admin |
| GET    | `/projects/{id}/attachments` · `/attachments/{id}/download` | all (scoped) |
| POST/DELETE | attachments | admin |
| GET    | `/activity` · `/projects/{id}/activity` | all (scoped) |
| GET    | `/notifications` · `/notifications/unread-count` | all (own) |
| POST   | `/notifications/{id}/read` · `/notifications/read-all` | all (own) |
| GET    | `/chat/threads` | admin |
| GET/POST | `/chat/messages` · GET `/chat/unread-count` | all (own thread) |
| GET    | `/auth/sessions` | all (own) |
| DELETE | `/auth/sessions/{id}` · POST `/auth/sessions/revoke-others` | all (own) |
| GET/POST/PATCH | `/users…` (client accounts) | admin |
| PATCH  | `/users/me/password` | all |

## Environment Variables

Backend (see `backend/.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./app.db` | Use a `postgresql://…` URL in production |
| `SECRET_KEY` | `change-me-in-production` | JWT signing key — **must** be changed |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated allowed origins |
| `UPLOAD_DIR` | `./uploads` | Attachment storage (a Docker volume in compose) |
| `MAX_UPLOAD_SIZE_MB` | `20` | Attachment size limit |

## Notes

- Attachments are stored on the local filesystem (a named volume in Docker) with
  randomized filenames; original names are preserved for downloads.
- The activity timeline is generated automatically from proposal, task, comment,
  attachment and login/logout events.
- Project progress is computed as completed tasks ÷ total tasks.
