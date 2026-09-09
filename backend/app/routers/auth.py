from __future__ import annotations

import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.database import get_db
from app.deps import get_current_session, get_current_user
from app.models import Session, User
from app.schemas import LoginRequest, SessionOut, Token, UserOut
from app.security import create_access_token, verify_password
from app.services.activity import log_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(body: LoginRequest, request: Request, db: DbSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    session = Session(
        id=uuid.uuid4().hex,
        user_id=user.id,
        user_agent=(request.headers.get("user-agent") or "")[:255],
        ip_address=(request.headers.get("x-forwarded-for") or request.client.host or "").split(",")[0].strip()[:45],
    )
    db.add(session)
    log_activity(db, user, "Login", f"{user.full_name} logged in")
    db.commit()
    return Token(access_token=create_access_token(user.id, user.role, session.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    session: Session = Depends(get_current_session),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    session.revoked_at = datetime.utcnow()
    log_activity(db, user, "Logout", f"{user.full_name} logged out")
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/sessions", response_model=List[SessionOut])
def list_sessions(
    current: Session = Depends(get_current_session),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    sessions = db.scalars(
        select(Session)
        .where(Session.user_id == user.id, Session.revoked_at.is_(None))
        .order_by(Session.last_seen_at.desc())
    ).all()
    return [
        SessionOut.model_validate(s).model_copy(update={"is_current": s.id == current.id})
        for s in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    session = db.get(Session, session_id)
    if session is None or session.user_id != user.id or session.revoked_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    session.revoked_at = datetime.utcnow()
    db.commit()


@router.post("/sessions/revoke-others", status_code=status.HTTP_204_NO_CONTENT)
def revoke_other_sessions(
    current: Session = Depends(get_current_session),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    others = db.scalars(
        select(Session).where(
            Session.user_id == user.id, Session.revoked_at.is_(None), Session.id != current.id
        )
    ).all()
    for session in others:
        session.revoked_at = datetime.utcnow()
    db.commit()
