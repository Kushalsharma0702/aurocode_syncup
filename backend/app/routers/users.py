from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta
from typing import List
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import ClientAccessLink, User
from app.schemas import ClientAccessLinkOut, UserCreate, UserOut, UserUpdate
from app.security import hash_password, hash_token
from app.services.activity import log_activity
from app.services.email import render_email, send_email

router = APIRouter(prefix="/api/users", tags=["users"])


def whatsapp_url(phone: str, message: str) -> str:
    """Build a wa.me link. Returns "" when there's no usable number."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) < 8:
        return ""
    return f"https://wa.me/{digits}?text={quote(message)}"


@router.get("", response_model=List[UserOut], dependencies=[Depends(require_admin)])
def list_clients(db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role == "client").order_by(User.username)).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_client(body: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    user = User(
        username=body.username,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role="client",
        email=(body.email or ""),
        phone=body.phone or "",
    )
    db.add(user)
    log_activity(db, admin, "Client Created", f"Client account '{body.username}' created")
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_client(user_id: int, body: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None or user.role != "client":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.password is not None:
        user.hashed_password = hash_password(body.password)
    if body.email is not None:
        user.email = body.email
    if body.phone is not None:
        user.phone = body.phone
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        state = "enabled" if body.is_active else "disabled"
        log_activity(db, admin, "Client Updated", f"Client account '{user.username}' {state}")
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/access-link", response_model=ClientAccessLinkOut, status_code=status.HTTP_201_CREATED)
def create_access_link(
    user_id: int,
    send: bool = False,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Issue a magic link so a client can open the portal without a password.

    Any previously issued link for this client is revoked first, so there is
    only ever one live link per person to keep track of.
    """
    user = db.get(User, user_id)
    if user is None or user.role != "client":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    if not user.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is disabled")

    now = datetime.utcnow()
    existing = db.scalars(
        select(ClientAccessLink).where(
            ClientAccessLink.user_id == user_id, ClientAccessLink.revoked_at.is_(None)
        )
    ).all()
    for link in existing:
        link.revoked_at = now

    raw_token = secrets.token_urlsafe(32)
    db.add(ClientAccessLink(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        created_by=admin.id,
        expires_at=now + timedelta(days=settings.MAGIC_LINK_EXPIRE_DAYS),
    ))
    log_activity(db, admin, "Access Link Issued", f"Sign-in link created for '{user.username}'")
    db.commit()

    url = f"{settings.FRONTEND_PUBLIC_URL}/go/{raw_token}"
    expires_at = now + timedelta(days=settings.MAGIC_LINK_EXPIRE_DAYS)
    message = f"Hi {user.full_name}, here's your private link to follow your project: {url}"

    if send and user.email:
        text, html = render_email(
            "Your SyncUp access link",
            [
                f"Hi {user.full_name},",
                "Use the button below to open your project portal. No password needed.",
                f"This link works until {expires_at:%d %b %Y}.",
            ],
            "Open my portal",
            url,
        )
        send_email(user.email, "Your SyncUp access link", text, html)

    return ClientAccessLinkOut(
        url=url,
        expires_at=expires_at,
        whatsapp_url=whatsapp_url(user.phone, message),
    )


@router.delete("/{user_id}/access-link", status_code=status.HTTP_204_NO_CONTENT)
def revoke_access_links(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None or user.role != "client":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    links = db.scalars(
        select(ClientAccessLink).where(
            ClientAccessLink.user_id == user_id, ClientAccessLink.revoked_at.is_(None)
        )
    ).all()
    for link in links:
        link.revoked_at = datetime.utcnow()
    if links:
        log_activity(db, admin, "Access Link Revoked", f"Sign-in link revoked for '{user.username}'")
    db.commit()


@router.patch("/me/password", response_model=UserOut)
def change_own_password(body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not body.password:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password is required")
    db_user = db.get(User, user.id)
    db_user.hashed_password = hash_password(body.password)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.patch("/me/contact", response_model=UserOut)
def update_own_contact(body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Lets anyone keep their own email and phone current, so notifications land."""
    db_user = db.get(User, user.id)
    if body.email is not None:
        db_user.email = body.email
    if body.phone is not None:
        db_user.phone = body.phone
    db.commit()
    db.refresh(db_user)
    return db_user
