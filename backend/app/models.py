from __future__ import annotations

from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import String, Text, ForeignKey, Boolean, DateTime, Date, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Enum values stored as plain strings so SQLite and PostgreSQL behave identically.
ROLES = ("admin", "client")
PROJECT_STATUSES = ("Draft", "Sent", "In Review", "Approved", "Rejected", "Completed")
TASK_STATUSES = ("Pending", "In Progress", "Blocked", "Completed")
TASK_PRIORITIES = ("Low", "Medium", "High", "Critical")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default="client")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    projects: Mapped[List["Project"]] = relationship(back_populates="client")
    comments: Mapped[List["Comment"]] = relationship(back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    client_name: Mapped[str] = mapped_column(String(100), index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    objective: Mapped[str] = mapped_column(Text, default="")
    scope: Mapped[str] = mapped_column(Text, default="")
    deliverables: Mapped[str] = mapped_column(Text, default="")
    timeline: Mapped[str] = mapped_column(String(200), default="")
    budget: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[str] = mapped_column(String(20), default="Draft", index=True)
    widget_key: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client: Mapped[Optional["User"]] = relationship(back_populates="projects")
    tasks: Mapped[List["Task"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    comments: Mapped[List["Comment"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    attachments: Mapped[List["Attachment"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    activities: Mapped[List["ActivityLog"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    assigned_to: Mapped[str] = mapped_column(String(100), default="")
    priority: Mapped[str] = mapped_column(String(10), default="Medium", index=True)
    status: Mapped[str] = mapped_column(String(15), default="Pending", index=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Populated when this task was filed through the embeddable feedback widget
    # rather than typed in by an admin.
    source: Mapped[str] = mapped_column(String(10), default="manual")  # "manual" | "widget"
    page_url: Mapped[str] = mapped_column(String(500), default="")
    pin_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # % across page width, 0-100
    pin_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # % down page height, 0-100
    screenshot_filename: Mapped[str] = mapped_column(String(255), default="")
    reporter_name: Mapped[str] = mapped_column(String(100), default="")
    browser_info: Mapped[str] = mapped_column(String(255), default="")

    project: Mapped["Project"] = relationship(back_populates="tasks")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship(back_populates="comments")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))  # stored name on disk
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="attachments")


class Session(Base):
    """A login session. JWTs carry the session id so individual devices can be revoked."""
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # uuid4 hex
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    user_agent: Mapped[str] = mapped_column(String(255), default="")
    ip_address: Mapped[str] = mapped_column(String(45), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # recipient
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Message(Base):
    """Direct chat between the freelancer (admin) and a client.

    Each client has one thread, keyed by thread_user_id (the client's user id).
    """
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    thread_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])


class StatusUpdate(Base):
    """System-wide status / maintenance log posted by admins."""
    __tablename__ = "status_updates"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    # operational | maintenance | degraded | incident
    type: Mapped[str] = mapped_column(String(20), default="operational", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))

    author: Mapped["User"] = relationship()


class ReportShareLink(Base):
    """An opaque, revocable link that lets a client view a read-only project report with no login."""
    __tablename__ = "report_share_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped["Project"] = relationship()


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    detail: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    project: Mapped[Optional["Project"]] = relationship(back_populates="activities")
    user: Mapped[Optional["User"]] = relationship()
