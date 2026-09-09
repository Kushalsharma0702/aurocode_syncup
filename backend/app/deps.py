from typing import Optional
from datetime import datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as DbSession

from app.database import get_db
from app.models import Project, Session, User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_session(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: DbSession = Depends(get_db),
) -> Session:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    session = db.get(Session, payload.get("sid", ""))
    if session is None or session.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session has been signed out")
    # Keep last_seen fresh without a write on every single request.
    if datetime.utcnow() - session.last_seen_at > timedelta(minutes=1):
        session.last_seen_at = datetime.utcnow()
        db.commit()
    return session


def get_current_user(
    session: Session = Depends(get_current_session),
    db: DbSession = Depends(get_db),
) -> User:
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is disabled or missing")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


def get_project_for_user(project_id: int, user: User, db: DbSession) -> Project:
    """Fetch a project, enforcing that clients can only see their own projects."""
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if user.role != "admin" and project.client_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project
