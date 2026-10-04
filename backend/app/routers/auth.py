from __future__ import annotations

import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_session, get_current_user
from app.models import ClientAccessLink, Session, User
from app.schemas import LoginRequest, SessionOut, Token, UserOut
from app.security import create_access_token, hash_token, verify_password
from app.services import ratelimit
from app.services.activity import log_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _start_session(user: User, request: Request, db: DbSession, how: str) -> Token:
    session = Session(
        id=uuid.uuid4().hex,
        user_id=user.id,
        user_agent=(request.headers.get("user-agent") or "")[:255],
        ip_address=ratelimit.client_ip(request),
    )
    db.add(session)
    log_activity(db, user, "Login", f"{user.full_name} signed in {how}")
    db.commit()
    return Token(access_token=create_access_token(user.id, user.role, session.id))


@router.post("/login", response_model=Token)
def login(body: LoginRequest, request: Request, db: DbSession = Depends(get_db)):
    # Throttle per username+IP so neither a single account nor a single source
    # can be ground down, without letting one attacker lock out a real user
    # from everywhere.
    ip = ratelimit.client_ip(request)
    bucket = f"login:{body.username.lower()}:{ip}"
    window = settings.LOGIN_WINDOW_MINUTES * 60
    if not ratelimit.peek(bucket, settings.LOGIN_MAX_ATTEMPTS, window):
        wait = ratelimit.retry_after(bucket, window)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed sign-in attempts. Try again in {max(1, wait // 60)} minute(s).",
            headers={"Retry-After": str(wait)},
        )

    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not verify_password(body.password, user.hashed_password):
        ratelimit.hit(bucket, settings.LOGIN_MAX_ATTEMPTS, window)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    ratelimit.reset(bucket)
    return _start_session(user, request, db, "with a password")


@router.post("/magic/{token}", response_model=Token)
def redeem_magic_link(token: str, request: Request, db: DbSession = Depends(get_db)):
    """Exchange a magic link for a session — no password involved.

    Links are multi-use until they expire or are revoked, because clients
    forward and re-open the same message; the trade-off is deliberate and the
    link is revocable from the admin UI at any time.
    """
    ip = ratelimit.client_ip(request)
    if not ratelimit.hit(f"magic:{ip}", 20, 3600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please try again later.")

    link = db.scalar(select(ClientAccessLink).where(ClientAccessLink.token_hash == hash_token(token)))
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link is not valid")
    if link.revoked_at is not None:
        raise HTTPException(status.HTTP_410_GONE, "This link has been revoked")
    if link.expires_at < datetime.utcnow():
        raise HTTPException(status.HTTP_410_GONE, "This link has expired")

    user = db.get(User, link.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is no longer active")

    link.last_used_at = datetime.utcnow()
    link.use_count += 1
    return _start_session(user, request, db, "via a secure link")


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
