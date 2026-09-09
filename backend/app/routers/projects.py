from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_project_for_user, require_admin
from app.models import Project, Task, User
from app.schemas import Page, ProjectCreate, ProjectOut, ProjectStatus, ProjectUpdate
from app.services.activity import log_activity
from app.services.notify import notify_project_client

router = APIRouter(prefix="/api/projects", tags=["projects"])


def serialize_project(project: Project) -> ProjectOut:
    total = len(project.tasks)
    completed = sum(1 for t in project.tasks if t.status == "Completed")
    out = ProjectOut.model_validate(project)
    out.task_count = total
    out.completed_task_count = completed
    out.progress = round(completed / total * 100) if total else 0
    return out


def validate_client_id(db: Session, client_id: Optional[int]) -> None:
    if client_id is None:
        return
    client = db.get(User, client_id)
    if client is None or client.role != "client":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "client_id must reference a client account")


@router.get("", response_model=Page[ProjectOut])
def list_projects(
    search: str = Query("", max_length=200),
    status_filter: Optional[ProjectStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Project)
    if user.role != "admin":
        query = query.where(Project.client_id == user.id)
    if search:
        like = f"%{search}%"
        query = query.where(or_(Project.name.ilike(like), Project.client_name.ilike(like)))
    if status_filter:
        query = query.where(Project.status == status_filter)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    projects = db.scalars(
        query.order_by(Project.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page(items=[serialize_project(p) for p in projects], total=total, page=page, page_size=page_size)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize_project(get_project_for_user(project_id, user, db))


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    validate_client_id(db, body.client_id)
    project = Project(**body.model_dump())
    db.add(project)
    db.flush()
    log_activity(db, admin, "Proposal Created", f"Proposal '{project.name}' created", project.id)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int, body: ProjectUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    changes = body.model_dump(exclude_unset=True)
    if "client_id" in changes:
        validate_client_id(db, changes["client_id"])
    old_status = project.status
    for field, value in changes.items():
        setattr(project, field, value)
    if "status" in changes and changes["status"] != old_status:
        log_activity(
            db, admin, "Status Changed",
            f"Proposal '{project.name}' status: {old_status} → {changes['status']}", project.id,
        )
        notify_project_client(
            db, project, f"Proposal status updated: {project.name}",
            f"Status changed from {old_status} to {changes['status']}",
        )
    else:
        log_activity(db, admin, "Proposal Updated", f"Proposal '{project.name}' updated", project.id)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    name = project.name
    db.delete(project)
    log_activity(db, admin, "Proposal Deleted", f"Proposal '{name}' deleted")
    db.commit()
