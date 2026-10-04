import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import require_admin
from app.models import ActivityLog, Project, ReportShareLink, User
from app.schemas import PublicActivity, PublicReportOut, ReportLinkOut, ReportLinkSummary
from app.security import hash_token

router = APIRouter(prefix="/api", tags=["reports"])


@router.post(
    "/projects/{project_id}/report-links",
    response_model=ReportLinkOut,
    status_code=status.HTTP_201_CREATED,
)
def create_report_link(project_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    raw_token = secrets.token_urlsafe(32)
    link = ReportShareLink(
        project_id=project_id,
        created_by=admin.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.utcnow() + timedelta(days=settings.REPORT_LINK_EXPIRE_DAYS),
    )
    db.add(link)
    db.flush()
    db.add(ActivityLog(
        user_id=admin.id, project_id=project_id, action="Report Link Created",
        detail=f"Shareable report link created for '{project.name}'",
    ))
    db.commit()
    db.refresh(link)

    url = f"{settings.FRONTEND_PUBLIC_URL}/r/{raw_token}"
    return ReportLinkOut(id=link.id, url=url, expires_at=link.expires_at, created_at=link.created_at)


@router.get("/projects/{project_id}/report-links", response_model=list[ReportLinkSummary])
def list_report_links(project_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return (
        db.query(ReportShareLink)
        .filter(ReportShareLink.project_id == project_id)
        .order_by(ReportShareLink.created_at.desc())
        .all()
    )


@router.delete("/projects/{project_id}/report-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_report_link(
    project_id: int, link_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    link = db.get(ReportShareLink, link_id)
    if link is None or link.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report link not found")
    link.revoked_at = datetime.utcnow()
    db.add(ActivityLog(
        user_id=admin.id, project_id=project_id, action="Report Link Revoked",
        detail="Shareable report link revoked",
    ))
    db.commit()


@router.get("/public/reports/{token}", response_model=PublicReportOut)
def get_public_report(token: str, db: Session = Depends(get_db)):
    token_hash = hash_token(token)
    link = db.query(ReportShareLink).filter(ReportShareLink.token_hash == token_hash).first()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

    now = datetime.utcnow()
    if link.revoked_at is not None:
        raise HTTPException(status.HTTP_410_GONE, "This report link has been revoked")
    if link.expires_at < now:
        raise HTTPException(status.HTTP_410_GONE, "This report link has expired")

    project = db.get(Project, link.project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

    link.last_viewed_at = now
    link.view_count += 1
    db.commit()

    # Same rule as the private project view: widget feedback isn't planned
    # scope, so it doesn't count toward progress.
    planned = [t for t in project.tasks if t.source != "widget"]
    total = len(planned)
    completed = sum(1 for t in planned if t.status == "Completed")
    activities = (
        db.query(ActivityLog)
        .filter(ActivityLog.project_id == project.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(10)
        .all()
    )

    return PublicReportOut(
        project_name=project.name,
        client_name=project.client_name,
        description=project.description,
        status=project.status,
        timeline=project.timeline,
        # Share links get forwarded well beyond the person they were sent to,
        # so commercial terms stay off them unless explicitly switched on.
        budget=project.budget if settings.REPORT_SHOW_BUDGET else "",
        task_count=total,
        completed_task_count=completed,
        progress=round(completed / total * 100) if total else 0,
        activities=[
            PublicActivity(action=a.action, detail=a.detail, created_at=a.created_at) for a in activities
        ],
        generated_at=now,
    )
