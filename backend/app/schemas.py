from __future__ import annotations

from datetime import datetime, date
from typing import Generic, List, Literal, TypeVar, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

ProjectStatus = Literal["Draft", "Sent", "In Review", "Approved", "Rejected", "Completed"]
StatusType = Literal["operational", "maintenance", "degraded", "incident"]
TaskStatus = Literal["Pending", "In Progress", "Blocked", "Completed"]
TaskPriority = Literal["Low", "Medium", "High", "Critical"]

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---- Auth / Users ----

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    email: str = ""
    phone: str = ""
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=128)
    email: EmailStr | None = None
    # Stored in E.164-ish form so it can be used for a wa.me link.
    phone: str = Field(default="", max_length=20, pattern=r"^[0-9+\- ]*$")


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    is_active: Optional[bool] = None
    email: EmailStr | None = None
    phone: Optional[str] = Field(default=None, max_length=20, pattern=r"^[0-9+\- ]*$")


# ---- Projects ----

class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    client_name: str = Field(min_length=1, max_length=100)
    client_id: Optional[int] = None
    description: str = ""
    objective: str = ""
    scope: str = ""
    deliverables: str = ""
    timeline: str = Field(default="", max_length=200)
    budget: str = Field(default="", max_length=100)
    status: ProjectStatus = "Draft"


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    client_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    client_id: Optional[int] = None
    description: Optional[str] = None
    objective: Optional[str] = None
    scope: Optional[str] = None
    deliverables: Optional[str] = None
    timeline: Optional[str] = Field(default=None, max_length=200)
    budget: Optional[str] = Field(default=None, max_length=100)
    status: Optional[ProjectStatus] = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    task_count: int = 0
    completed_task_count: int = 0
    progress: int = 0
    # Widget feedback is tracked separately so it never drags progress down.
    feedback_open_count: int = 0
    feedback_total_count: int = 0


# ---- Tasks ----

class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    assigned_to: str = Field(default="", max_length=100)
    priority: TaskPriority = "Medium"
    status: TaskStatus = "Pending"
    due_date: Optional[date] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    assigned_to: Optional[str] = Field(default=None, max_length=100)
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[date] = None


class TaskOut(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    project_name: str = ""
    created_at: datetime
    updated_at: datetime
    source: str = "manual"
    page_url: str = ""
    pin_x: Optional[float] = None
    pin_y: Optional[float] = None
    has_screenshot: bool = False
    reporter_name: str = ""
    browser_info: str = ""
    client_state: str = "Received"
    verified_at: Optional[datetime] = None
    reopened_count: int = 0
    ack_due_date: Optional[date] = None


# ---- Comments ----

class CommentCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class CommentUpdate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    project_name: str = ""
    user: UserOut
    message: str
    created_at: datetime


# ---- Attachments ----

class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    original_name: str
    content_type: str
    size: int
    created_at: datetime


# ---- Activity ----

class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: Optional[int]
    project_name: Optional[str] = None
    user: Optional[UserOut]
    action: str
    detail: str
    created_at: datetime


# ---- Sessions ----

class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_agent: str
    ip_address: str
    created_at: datetime
    last_seen_at: datetime
    is_current: bool = False


# ---- Notifications ----

class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: Optional[int]
    title: str
    body: str
    created_at: datetime
    read_at: Optional[datetime]


class UnreadCount(BaseModel):
    unread: int


# ---- Chat ----

class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    client_id: Optional[int] = None  # required when an admin sends; ignored for clients


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_user_id: int
    sender: UserOut
    body: str
    created_at: datetime
    read_at: Optional[datetime]


class ChatThread(BaseModel):
    client: UserOut
    last_message: Optional[MessageOut]
    unread: int


# ---- System Status ----

class StatusCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    type: StatusType = "operational"

class StatusEdit(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    message: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    type: Optional[StatusType] = None

class StatusResolve(BaseModel):
    resolved_at: Optional[datetime] = None

class StatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    message: str
    type: str
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]
    author: UserOut


# ---- Report Links ----

class ReportLinkOut(BaseModel):
    id: int
    url: str
    expires_at: datetime
    created_at: datetime


class ReportLinkSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expires_at: datetime
    created_at: datetime
    revoked_at: Optional[datetime]
    last_viewed_at: Optional[datetime]
    view_count: int


class PublicActivity(BaseModel):
    action: str
    detail: str
    created_at: datetime


class PublicReportOut(BaseModel):
    project_name: str
    client_name: str
    description: str
    status: str
    timeline: str
    budget: str
    task_count: int
    completed_task_count: int
    progress: int
    activities: list[PublicActivity] = []
    generated_at: datetime


# ---- Feedback Widget ----

class WidgetKeyOut(BaseModel):
    widget_key: str
    embed_snippet: str
    allowed_origins: list[str] = []


class WidgetOriginsUpdate(BaseModel):
    # An empty list means "any site", which we surface as a warning in the UI.
    origins: list[str] = Field(default_factory=list, max_length=20)


class WidgetFunnelPoint(BaseModel):
    event: str
    count: int


class ClientAccessLinkOut(BaseModel):
    url: str
    expires_at: datetime
    whatsapp_url: str = ""


# ---- Dashboard ----

class DashboardStats(BaseModel):
    total_projects: int
    active_projects: int
    completed_projects: int
    pending_tasks: int
    recent_activity: list[ActivityOut]
