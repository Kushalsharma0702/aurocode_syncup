from __future__ import annotations

import secrets
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_project_for_user, require_admin
from app.models import Project, Task, User
from app.schemas import WidgetKeyOut
from app.services.activity import log_activity
from app.services.notify import notify_admins

router = APIRouter(prefix="/api", tags=["widget"])


def upload_dir() -> Path:
    path = Path(settings.UPLOAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def widget_key_out(project: Project) -> WidgetKeyOut:
    snippet = (
        f'<script src="{settings.FRONTEND_PUBLIC_URL}/widget.js" '
        f'data-project="{project.widget_key}" '
        f'data-api="{settings.FRONTEND_PUBLIC_URL}/api" async></script>'
    )
    return WidgetKeyOut(widget_key=project.widget_key, embed_snippet=snippet)


@router.get("/projects/{project_id}/widget-key", response_model=WidgetKeyOut)
def get_widget_key(project_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if not project.widget_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback widget is not enabled for this project")
    return widget_key_out(project)


@router.post("/projects/{project_id}/widget-key", response_model=WidgetKeyOut, status_code=status.HTTP_201_CREATED)
def create_widget_key(project_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    project.widget_key = secrets.token_hex(16)
    log_activity(db, admin, "Feedback Widget Enabled", f"Embed key issued for '{project.name}'", project_id)
    db.commit()
    db.refresh(project)
    return widget_key_out(project)


@router.delete("/projects/{project_id}/widget-key", status_code=status.HTTP_204_NO_CONTENT)
def revoke_widget_key(project_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    project.widget_key = None
    log_activity(db, admin, "Feedback Widget Disabled", f"Embed key revoked for '{project.name}'", project_id)
    db.commit()


@router.post("/public/widget/{widget_key}/feedback", status_code=status.HTTP_201_CREATED)
def submit_widget_feedback(
    widget_key: str,
    message: str = Form(..., min_length=1, max_length=2000),
    page_url: str = Form("", max_length=500),
    pin_x: Optional[float] = Form(None),
    pin_y: Optional[float] = Form(None),
    reporter_name: str = Form("", max_length=100),
    browser_info: str = Form("", max_length=255),
    screenshot: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.widget_key == widget_key).first()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid widget key")

    screenshot_filename = ""
    if screenshot is not None and screenshot.filename:
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        content = screenshot.file.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Screenshot exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit",
            )
        suffix = Path(screenshot.filename).suffix[:10] or ".png"
        screenshot_filename = f"{uuid.uuid4().hex}{suffix}"
        (upload_dir() / screenshot_filename).write_bytes(content)

    title = message.strip().splitlines()[0][:80] if message.strip() else "Widget feedback"
    task = Task(
        project_id=project.id,
        title=f"Feedback: {title}",
        description=message[:2000],
        status="Pending",
        priority="Medium",
        source="widget",
        page_url=page_url[:500],
        pin_x=pin_x,
        pin_y=pin_y,
        screenshot_filename=screenshot_filename,
        reporter_name=reporter_name[:100],
        browser_info=browser_info[:255],
    )
    db.add(task)
    db.flush()
    log_activity(
        db, None, "Widget Feedback",
        f"New feedback on '{project.name}' from {page_url or 'an unknown page'}", project.id,
    )
    notify_admins(db, f"New feedback on {project.name}", message[:200], project.id)
    db.commit()
    return {"ok": True}


@router.get("/tasks/{task_id}/screenshot")
def get_task_screenshot(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None or not task.screenshot_filename:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No screenshot for this task")
    get_project_for_user(task.project_id, user, db)  # enforces client scoping
    file_path = upload_dir() / task.screenshot_filename
    if not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screenshot is missing on the server")
    return FileResponse(file_path)
