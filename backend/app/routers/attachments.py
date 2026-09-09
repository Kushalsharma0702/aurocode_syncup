from __future__ import annotations

import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_project_for_user, require_admin
from app.models import Attachment, Project, User
from app.schemas import AttachmentOut
from app.services.activity import log_activity
from app.services.notify import notify_project_client

router = APIRouter(prefix="/api", tags=["attachments"])


def upload_dir() -> Path:
    path = Path(settings.UPLOAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.get("/projects/{project_id}/attachments", response_model=List[AttachmentOut])
def list_attachments(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = get_project_for_user(project_id, user, db)
    return sorted(project.attachments, key=lambda a: a.id)


@router.post(
    "/projects/{project_id}/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED
)
def upload_attachment(
    project_id: int, file: UploadFile, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if not file.filename:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A file is required")

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit",
        )

    # Random stored name prevents path traversal and collisions.
    suffix = Path(file.filename).suffix[:20]
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    (upload_dir() / stored_name).write_bytes(content)

    attachment = Attachment(
        project_id=project_id,
        filename=stored_name,
        original_name=Path(file.filename).name[:255],
        content_type=file.content_type or "application/octet-stream",
        size=len(content),
        uploaded_by=admin.id,
    )
    db.add(attachment)
    log_activity(db, admin, "Attachment Uploaded", f"'{attachment.original_name}' added to '{project.name}'", project_id)
    notify_project_client(
        db, project, f"New file on {project.name}", f"'{attachment.original_name}' is available for download"
    )
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    get_project_for_user(attachment.project_id, user, db)  # enforces client scoping
    file_path = upload_dir() / attachment.filename
    if not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File is missing on the server")
    return FileResponse(file_path, filename=attachment.original_name, media_type=attachment.content_type)


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(attachment_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    (upload_dir() / attachment.filename).unlink(missing_ok=True)
    log_activity(db, admin, "Attachment Deleted", f"'{attachment.original_name}' removed", attachment.project_id)
    db.delete(attachment)
    db.commit()
