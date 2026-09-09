from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate
from app.security import hash_password
from app.services.activity import log_activity

router = APIRouter(prefix="/api/users", tags=["users"])


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
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        state = "enabled" if body.is_active else "disabled"
        log_activity(db, admin, "Client Updated", f"Client account '{user.username}' {state}")
    db.commit()
    db.refresh(user)
    return user


@router.patch("/me/password", response_model=UserOut)
def change_own_password(body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not body.password:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password is required")
    db_user = db.get(User, user.id)
    db_user.hashed_password = hash_password(body.password)
    db.commit()
    db.refresh(db_user)
    return db_user
