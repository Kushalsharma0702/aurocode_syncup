from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, get_project_for_user, require_admin
from app.models import Comment, Project, User
from app.schemas import CommentCreate, CommentOut, CommentUpdate, Page
from app.services.activity import log_activity
from app.services.notify import notify_admins, notify_project_client

router = APIRouter(prefix="/api", tags=["comments"])


def serialize_comment(comment: Comment) -> CommentOut:
    out = CommentOut.model_validate(comment)
    out.project_name = comment.project.name
    return out


@router.get("/comments", response_model=Page[CommentOut])
def list_all_comments(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Comment).join(Project).options(joinedload(Comment.project), joinedload(Comment.user))
    if user.role != "admin":
        query = query.where(Project.client_id == user.id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    comments = db.scalars(
        query.order_by(Comment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page(items=[serialize_comment(c) for c in comments], total=total, page=page, page_size=page_size)


@router.get("/projects/{project_id}/comments", response_model=List[CommentOut])
def list_project_comments(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = get_project_for_user(project_id, user, db)
    return [serialize_comment(c) for c in sorted(project.comments, key=lambda c: c.created_at)]


@router.post("/projects/{project_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def create_comment(
    project_id: int, body: CommentCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    project = get_project_for_user(project_id, user, db)
    comment = Comment(project_id=project.id, user_id=user.id, message=body.message)
    db.add(comment)
    log_activity(db, user, "Comment Added", f"{user.full_name} commented on '{project.name}'", project.id)
    preview = body.message if len(body.message) <= 120 else body.message[:117] + "…"
    if user.role == "admin":
        notify_project_client(db, project, f"New comment on {project.name}", f"{user.full_name}: {preview}")
    else:
        notify_admins(db, f"New client comment on {project.name}", f"{user.full_name}: {preview}", project.id)
    db.commit()
    db.refresh(comment)
    return serialize_comment(comment)


@router.put("/comments/{comment_id}", response_model=CommentOut)
def update_comment(
    comment_id: int, body: CommentUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    comment.message = body.message
    db.commit()
    db.refresh(comment)
    return serialize_comment(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    db.delete(comment)
    db.commit()
