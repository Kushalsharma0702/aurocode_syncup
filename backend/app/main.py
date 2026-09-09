from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    activity, attachments, auth, chat, comments, dashboard, notifications, projects, reports, status, tasks, users,
)

app = FastAPI(title="Proposal Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, users.router, dashboard.router, projects.router,
               tasks.router, comments.router, attachments.router, activity.router,
               notifications.router, chat.router, status.router, reports.router):
    app.include_router(router)


@app.on_event("startup")
def ensure_upload_dir():
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
