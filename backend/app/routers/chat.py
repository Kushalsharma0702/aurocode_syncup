from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import Message, User
from app.schemas import ChatThread, MessageCreate, MessageOut, UnreadCount, UserOut

router = APIRouter(prefix="/api/chat", tags=["chat"])

MESSAGE_LIMIT = 200


def resolve_thread_user(db: Session, user: User, client_id: Optional[int]) -> int:
    """Clients always talk in their own thread; admins must name the client."""
    if user.role != "admin":
        return user.id
    if client_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "client_id is required for admins")
    client = db.get(User, client_id)
    if client is None or client.role != "client":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return client.id


def incoming_filter(user: User):
    """Messages 'incoming' for this user: sent by the other side of the thread."""
    if user.role == "admin":
        return Message.sender_id == Message.thread_user_id  # sent by the client
    return Message.sender_id != user.id  # sent by an admin


@router.get("/threads", response_model=List[ChatThread], dependencies=[Depends(require_admin)])
def list_threads(db: Session = Depends(get_db)):
    clients = db.scalars(select(User).where(User.role == "client").order_by(User.full_name)).all()
    threads = []
    for client in clients:
        last = db.scalar(
            select(Message)
            .options(joinedload(Message.sender))
            .where(Message.thread_user_id == client.id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(1)
        )
        unread = db.scalar(
            select(func.count()).select_from(Message).where(
                Message.thread_user_id == client.id,
                Message.sender_id == client.id,
                Message.read_at.is_(None),
            )
        )
        threads.append(
            ChatThread(
                client=UserOut.model_validate(client),
                last_message=MessageOut.model_validate(last) if last else None,
                unread=unread,
            )
        )
    # Most recently active threads first, empty threads last.
    threads.sort(key=lambda t: t.last_message.created_at if t.last_message else datetime.min, reverse=True)
    return threads


@router.get("/messages", response_model=List[MessageOut])
def list_messages(
    client_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread_user_id = resolve_thread_user(db, user, client_id)
    messages = db.scalars(
        select(Message)
        .options(joinedload(Message.sender))
        .where(Message.thread_user_id == thread_user_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(MESSAGE_LIMIT)
    ).all()

    # Opening a conversation marks incoming messages as read.
    now = datetime.utcnow()
    changed = False
    for message in messages:
        is_incoming = message.sender_id != user.id
        if is_incoming and message.read_at is None:
            message.read_at = now
            changed = True
    if changed:
        db.commit()

    return [MessageOut.model_validate(m) for m in reversed(messages)]


@router.post("/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(body: MessageCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    thread_user_id = resolve_thread_user(db, user, body.client_id)
    message = Message(thread_user_id=thread_user_id, sender_id=user.id, body=body.body)
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageOut.model_validate(message)


@router.get("/unread-count", response_model=UnreadCount)
def chat_unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(func.count()).select_from(Message).where(Message.read_at.is_(None), incoming_filter(user))
    if user.role != "admin":
        query = query.where(Message.thread_user_id == user.id)
    return UnreadCount(unread=db.scalar(query))
