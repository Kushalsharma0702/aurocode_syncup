from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_project_for_user, require_admin
from app.models import Project, Task, User, WidgetEvent
from app.schemas import WidgetKeyOut, WidgetOriginsUpdate
from app.services import ratelimit
from app.services.activity import log_activity
from app.services.widget_cache import invalidate
from app.services.notify import notify_admins

router = APIRouter(prefix="/api", tags=["widget"])

# Only real raster screenshots are accepted. Checked against the file's leading
# bytes rather than the client-supplied content type, which is trivially forged.
IMAGE_MAGIC = {
    b"\x89PNG\r\n\x1a\n": ".png",
    b"\xff\xd8\xff": ".jpg",
}
TRACKED_EVENTS = {"widget_opened", "pin_started", "pin_submitted", "pin_abandoned", "page_approved"}


def upload_dir() -> Path:
    path = Path(settings.UPLOAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def normalise_origin(value: str) -> str:
    """Reduce a URL or bare host to a scheme://host[:port] origin."""
    value = (value or "").strip().rstrip("/")
    if not value:
        return ""
    if "//" not in value:
        value = "https://" + value
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def allowed_origins(project: Project) -> list[str]:
    return [o for o in (normalise_origin(p) for p in project.widget_origins.split(",")) if o]


def origin_permitted(project: Project, origin: str) -> bool:
    """An empty allow-list means the admin hasn't locked the key down yet."""
    allowed = allowed_origins(project)
    if not allowed:
        return True
    return normalise_origin(origin) in allowed


def widget_key_out(project: Project) -> WidgetKeyOut:
    snippet = (
        f'<script src="{settings.FRONTEND_PUBLIC_URL}/widget.js" '
        f'data-project="{project.widget_key}" '
        f'data-api="{settings.FRONTEND_PUBLIC_URL}/api" async></script>'
    )
    return WidgetKeyOut(
        widget_key=project.widget_key,
        embed_snippet=snippet,
        allowed_origins=allowed_origins(project),
    )


def project_for_key(widget_key: str, db: Session) -> Project:
    project = db.query(Project).filter(Project.widget_key == widget_key).first()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid widget key")
    return project


def guard_public_request(request: Request, project: Project, widget_key: str) -> None:
    """Shared gate for every unauthenticated widget route."""
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if origin and not origin_permitted(project, origin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This origin is not allowed to post feedback")

    ip = ratelimit.client_ip(request)
    if not ratelimit.hit(f"widget:key:{widget_key}", settings.WIDGET_RATE_PER_HOUR, 3600):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "This site has sent too much feedback in the last hour. Please try again later.",
        )
    if not ratelimit.hit(f"widget:ip:{widget_key}:{ip}", settings.WIDGET_RATE_PER_IP_PER_HOUR, 3600):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "You've sent several pieces of feedback already. Please try again later.",
        )


# ---------------------------------------------------------------- admin routes

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
    invalidate(project.widget_key)
    project.widget_key = secrets.token_hex(16)
    log_activity(db, admin, "Feedback Widget Enabled", f"Embed key issued for '{project.name}'", project_id)
    db.commit()
    db.refresh(project)
    return widget_key_out(project)


@router.put("/projects/{project_id}/widget-origins", response_model=WidgetKeyOut)
def set_widget_origins(
    project_id: int,
    body: WidgetOriginsUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Lock a widget key to the sites it may be embedded on."""
    project = db.get(Project, project_id)
    if project is None or not project.widget_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback widget is not enabled for this project")

    cleaned: list[str] = []
    for raw in body.origins:
        origin = normalise_origin(raw)
        if not origin:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"'{raw}' is not a valid site address")
        if origin not in cleaned:
            cleaned.append(origin)

    project.widget_origins = ",".join(cleaned)[:500]
    invalidate(project.widget_key)
    log_activity(
        db, admin, "Feedback Widget Updated",
        f"Allowed sites set to {', '.join(cleaned) or 'any site'} for '{project.name}'", project_id,
    )
    db.commit()
    db.refresh(project)
    return widget_key_out(project)


@router.delete("/projects/{project_id}/widget-key", status_code=status.HTTP_204_NO_CONTENT)
def revoke_widget_key(project_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    invalidate(project.widget_key)
    project.widget_key = None
    project.widget_origins = ""
    log_activity(db, admin, "Feedback Widget Disabled", f"Embed key revoked for '{project.name}'", project_id)
    db.commit()


# --------------------------------------------------------------- public routes

@router.get("/public/widget/{widget_key}/config")
def widget_config(widget_key: str, request: Request, db: Session = Depends(get_db)):
    """Lets the embedded script confirm it's installed correctly before showing itself."""
    project = project_for_key(widget_key, db)
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if origin and not origin_permitted(project, origin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This origin is not allowed to use this widget")
    return {"project_name": project.name, "approvals_enabled": True}


@router.post("/public/widget/{widget_key}/event", status_code=status.HTTP_204_NO_CONTENT)
def record_event(
    widget_key: str,
    request: Request,
    event: str = Form(...),
    page_url: str = Form("", max_length=500),
    db: Session = Depends(get_db),
):
    """Funnel telemetry: how many people open the widget vs. actually send something."""
    if event not in TRACKED_EVENTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown event")
    project = project_for_key(widget_key, db)

    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if origin and not origin_permitted(project, origin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This origin is not allowed to use this widget")
    # Events are cheap but still rate-limited, generously, so they can't be used to flood the table.
    ip = ratelimit.client_ip(request)
    if not ratelimit.hit(f"widget:evt:{widget_key}:{ip}", settings.WIDGET_RATE_PER_IP_PER_HOUR * 10, 3600):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    db.add(WidgetEvent(project_id=project.id, event=event, page_url=page_url[:500]))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/public/widget/{widget_key}/approve", status_code=status.HTTP_201_CREATED)
def approve_page(
    widget_key: str,
    request: Request,
    page_url: str = Form("", max_length=500),
    reporter_name: str = Form("", max_length=100),
    db: Session = Depends(get_db),
):
    """'This page looks good' — a reason to open the widget when nothing is wrong."""
    project = project_for_key(widget_key, db)
    guard_public_request(request, project, widget_key)

    db.add(WidgetEvent(project_id=project.id, event="page_approved", page_url=page_url[:500]))
    who = reporter_name.strip()[:100] or "The client"
    log_activity(
        db, None, "Page Approved",
        f"{who} approved {page_url or 'a page'} on '{project.name}'", project.id,
    )
    notify_admins(db, f"Page approved on {project.name}", f"{who} approved {page_url or 'a page'}", project.id)
    db.commit()
    return {"ok": True}


@router.post("/public/widget/{widget_key}/feedback", status_code=status.HTTP_201_CREATED)
def submit_widget_feedback(
    request: Request,
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
    project = project_for_key(widget_key, db)
    guard_public_request(request, project, widget_key)

    screenshot_filename = ""
    if screenshot is not None and screenshot.filename:
        max_bytes = settings.WIDGET_MAX_SCREENSHOT_MB * 1024 * 1024
        content = screenshot.file.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Screenshot exceeds the {settings.WIDGET_MAX_SCREENSHOT_MB} MB limit",
            )
        suffix = next((ext for magic, ext in IMAGE_MAGIC.items() if content.startswith(magic)), None)
        if suffix is None:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                "Screenshot must be a PNG or JPEG image",
            )
        screenshot_filename = f"{uuid.uuid4().hex}{suffix}"
        (upload_dir() / screenshot_filename).write_bytes(content)

    title = message.strip().splitlines()[0][:80] if message.strip() else "Widget feedback"
    # Promise the client an update within two working days.
    ack_due = date.today() + timedelta(days=2)
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
        ack_due_date=ack_due,
    )
    db.add(task)
    db.add(WidgetEvent(project_id=project.id, event="pin_submitted", page_url=page_url[:500]))
    db.flush()
    log_activity(
        db, None, "Widget Feedback",
        f"New feedback on '{project.name}' from {page_url or 'an unknown page'}", project.id,
    )
    notify_admins(db, f"New feedback on {project.name}", message[:200], project.id)
    db.commit()
    return {
        "ok": True,
        "task_id": task.id,
        "state": task.client_state,
        "update_by": ack_due.isoformat(),
    }


# ------------------------------------------------------- authenticated viewing

@router.get("/tasks/{task_id}/screenshot")
def get_task_screenshot(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None or not task.screenshot_filename:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No screenshot for this task")
    get_project_for_user(task.project_id, user, db)  # enforces client scoping
    file_path = upload_dir() / task.screenshot_filename
    if not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screenshot is missing on the server")
    media_type = "image/png" if file_path.suffix == ".png" else "image/jpeg"
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'inline; filename="screenshot{file_path.suffix}"',
            "Cache-Control": "private, max-age=600",
        },
    )


@router.post("/tasks/{task_id}/verify", status_code=status.HTTP_200_OK)
def verify_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The client confirms a fix actually landed. Closes the loop on their own pin."""
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    project = get_project_for_user(task.project_id, user, db)
    if task.status != "Completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This isn't marked as fixed yet")

    task.verified_at = datetime.utcnow()
    log_activity(db, user, "Feedback Verified", f"{user.full_name} confirmed '{task.title}' is fixed", project.id)
    notify_admins(db, f"Client verified a fix on {project.name}", task.title, project.id)
    db.commit()
    return {"state": task.client_state}


@router.post("/tasks/{task_id}/reopen", status_code=status.HTTP_200_OK)
def reopen_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The client says it still isn't right."""
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    project = get_project_for_user(task.project_id, user, db)

    task.status = "In Progress"
    task.verified_at = None
    task.reopened_count += 1
    log_activity(db, user, "Feedback Reopened", f"{user.full_name} reopened '{task.title}'", project.id)
    notify_admins(db, f"Reopened on {project.name}", task.title, project.id)
    db.commit()
    return {"state": task.client_state}
