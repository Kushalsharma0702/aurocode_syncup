from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import ActivityLog, Project, Task, User
from app.routers.activity import scoped_activity_query, serialize_activity
from app.schemas import DashboardStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

ACTIVE_STATUSES = ("Sent", "In Review", "Approved")


@router.get("", response_model=DashboardStats)
def get_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def count_projects(*conditions):
        query = select(func.count()).select_from(Project)
        if user.role != "admin":
            query = query.where(Project.client_id == user.id)
        return db.scalar(query.where(*conditions) if conditions else query)

    pending_tasks_query = (
        select(func.count()).select_from(Task).where(Task.status.in_(("Pending", "In Progress", "Blocked")))
    )
    if user.role != "admin":
        client_projects = select(Project.id).where(Project.client_id == user.id)
        pending_tasks_query = pending_tasks_query.where(Task.project_id.in_(client_projects))

    recent_entries = db.scalars(
        scoped_activity_query(user)
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .limit(10)
    ).all()

    return DashboardStats(
        total_projects=count_projects(),
        active_projects=count_projects(Project.status.in_(ACTIVE_STATUSES)),
        completed_projects=count_projects(Project.status == "Completed"),
        pending_tasks=db.scalar(pending_tasks_query),
        recent_activity=[serialize_activity(e) for e in recent_entries],
    )
