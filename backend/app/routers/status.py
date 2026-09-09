from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import StatusUpdate, User
from app.schemas import StatusCreate, StatusEdit, StatusOut, StatusResolve

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("", response_model=List[StatusOut])
def list_status(
    limit: int = 50,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """All status log entries, newest first. Visible to all authenticated users."""
    rows = db.scalars(
        select(StatusUpdate)
        .options(joinedload(StatusUpdate.author))
        .order_by(StatusUpdate.created_at.desc())
        .limit(limit)
    ).all()
    return rows


@router.get("/current", response_model=Optional[StatusOut])
def current_status(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Latest unresolved non-operational entry — what to show in the banner."""
    row = db.scalar(
        select(StatusUpdate)
        .options(joinedload(StatusUpdate.author))
        .where(
            StatusUpdate.type != "operational",
            StatusUpdate.resolved_at.is_(None),
        )
        .order_by(StatusUpdate.created_at.desc())
        .limit(1)
    )
    return row


@router.post("", response_model=StatusOut, status_code=status.HTTP_201_CREATED)
def create_status(
    body: StatusCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = StatusUpdate(
        title=body.title,
        message=body.message,
        type=body.type,
        created_by=admin.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    # reload with author relationship
    return db.scalar(
        select(StatusUpdate)
        .options(joinedload(StatusUpdate.author))
        .where(StatusUpdate.id == entry.id)
    )


@router.patch("/{entry_id}", response_model=StatusOut)
def update_status(
    entry_id: int,
    body: StatusEdit,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = db.get(StatusUpdate, entry_id)
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Status entry not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    return db.scalar(
        select(StatusUpdate)
        .options(joinedload(StatusUpdate.author))
        .where(StatusUpdate.id == entry_id)
    )


@router.patch("/{entry_id}/resolve", response_model=StatusOut)
def resolve_status(
    entry_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = db.get(StatusUpdate, entry_id)
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Status entry not found")
    entry.resolved_at = datetime.utcnow()
    db.commit()
    return db.scalar(
        select(StatusUpdate)
        .options(joinedload(StatusUpdate.author))
        .where(StatusUpdate.id == entry_id)
    )


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_status(
    entry_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = db.get(StatusUpdate, entry_id)
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Status entry not found")
    db.delete(entry)
    db.commit()
