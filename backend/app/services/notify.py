from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, Project, User


def notify(db: Session, user_id: int, title: str, body: str = "", project_id: Optional[int] = None) -> None:
    """Queue an in-app notification. Caller is responsible for committing."""
    db.add(Notification(user_id=user_id, title=title[:200], body=body[:500], project_id=project_id))


def notify_admins(db: Session, title: str, body: str = "", project_id: Optional[int] = None) -> None:
    admin_ids = db.scalars(select(User.id).where(User.role == "admin", User.is_active.is_(True))).all()
    for admin_id in admin_ids:
        notify(db, admin_id, title, body, project_id)


def notify_project_client(db: Session, project: Project, title: str, body: str = "") -> None:
    if project.client_id is not None:
        notify(db, project.client_id, title, body, project.id)
