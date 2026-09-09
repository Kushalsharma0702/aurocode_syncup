from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, get_project_for_user
from app.models import ActivityLog, Project, User
from app.schemas import ActivityOut, Page

router = APIRouter(prefix="/api", tags=["activity"])


def serialize_activity(entry: ActivityLog) -> ActivityOut:
    out = ActivityOut.model_validate(entry)
    out.project_name = entry.project.name if entry.project else None
    return out


def scoped_activity_query(user: User):
    query = select(ActivityLog).options(joinedload(ActivityLog.user), joinedload(ActivityLog.project))
    if user.role != "admin":
        # Clients see activity for their own projects plus their own account events.
        query = query.outerjoin(Project, ActivityLog.project_id == Project.id).where(
            or_(Project.client_id == user.id, ActivityLog.user_id == user.id)
        )
    return query


@router.get("/activity", response_model=Page[ActivityOut])
def list_activity(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = scoped_activity_query(user)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    entries = db.scalars(
        query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page(items=[serialize_activity(e) for e in entries], total=total, page=page, page_size=page_size)


@router.get("/projects/{project_id}/activity", response_model=List[ActivityOut])
def list_project_activity(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_for_user(project_id, user, db)
    entries = db.scalars(
        select(ActivityLog)
        .options(joinedload(ActivityLog.user), joinedload(ActivityLog.project))
        .where(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
    ).all()
    return [serialize_activity(e) for e in entries]
