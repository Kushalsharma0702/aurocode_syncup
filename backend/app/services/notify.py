from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Notification, Project, User
from app.services.email import render_email, send_email


def notify(
    db: Session,
    user_id: int,
    title: str,
    body: str = "",
    project_id: Optional[int] = None,
    email: bool = True,
    cta_label: str = "Open in SyncUp",
    cta_url: str = "",
) -> None:
    """Queue an in-app notification, and mirror it by email when we have an address.

    The caller is responsible for committing the database row; the email is
    dispatched immediately on a background thread.
    """
    db.add(Notification(user_id=user_id, title=title[:200], body=body[:500], project_id=project_id))

    if not email:
        return
    user = db.get(User, user_id)
    if user is None or not user.email or not user.is_active:
        return

    if cta_url:
        url = cta_url
    elif project_id:
        url = f"{settings.FRONTEND_PUBLIC_URL}/projects/{project_id}"
    else:
        url = settings.FRONTEND_PUBLIC_URL
    text, html = render_email(title, [body] if body else [], cta_label, url)
    send_email(user.email, title, text, html)


def notify_admins(db: Session, title: str, body: str = "", project_id: Optional[int] = None) -> None:
    admin_ids = db.scalars(select(User.id).where(User.role == "admin", User.is_active.is_(True))).all()
    for admin_id in admin_ids:
        notify(db, admin_id, title, body, project_id)


def notify_project_client(db: Session, project: Project, title: str, body: str = "") -> None:
    if project.client_id is not None:
        notify(db, project.client_id, title, body, project.id)
