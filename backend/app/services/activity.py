from typing import Optional
from sqlalchemy.orm import Session

from app.models import ActivityLog, User


def log_activity(
    db: Session,
    user: Optional[User],
    action: str,
    detail: str = "",
    project_id: Optional[int] = None,
) -> None:
    """Record an activity log entry. Caller is responsible for committing."""
    db.add(
        ActivityLog(
            user_id=user.id if user else None,
            action=action,
            detail=detail[:500],
            project_id=project_id,
        )
    )
