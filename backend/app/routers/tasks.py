from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, get_project_for_user, require_admin
from app.models import Project, Task, User
from app.schemas import Page, TaskCreate, TaskOut, TaskPriority, TaskStatus, TaskUpdate
from app.services.activity import log_activity
from app.services.notify import notify_project_client

router = APIRouter(prefix="/api", tags=["tasks"])


def serialize_task(task: Task) -> TaskOut:
    out = TaskOut.model_validate(task)
    out.project_name = task.project.name
    return out


@router.get("/tasks", response_model=Page[TaskOut])
def list_all_tasks(
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
    priority: Optional[TaskPriority] = None,
    search: str = Query("", max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Task).join(Project).options(joinedload(Task.project))
    if user.role != "admin":
        query = query.where(Project.client_id == user.id)
    if status_filter:
        query = query.where(Task.status == status_filter)
    if priority:
        query = query.where(Task.priority == priority)
    if search:
        query = query.where(Task.title.ilike(f"%{search}%"))

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    tasks = db.scalars(
        query.order_by(Task.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page(items=[serialize_task(t) for t in tasks], total=total, page=page, page_size=page_size)


@router.get("/projects/{project_id}/tasks", response_model=List[TaskOut])
def list_project_tasks(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = get_project_for_user(project_id, user, db)
    return [serialize_task(t) for t in sorted(project.tasks, key=lambda t: t.id)]


@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: int, body: TaskCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    task = Task(project_id=project_id, **body.model_dump())
    db.add(task)
    db.flush()
    log_activity(db, admin, "Task Added", f"Task '{task.title}' added to '{project.name}'", project_id)
    db.commit()
    db.refresh(task)
    return serialize_task(task)


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    changes = body.model_dump(exclude_unset=True)
    old_status, old_priority = task.status, task.priority
    for field, value in changes.items():
        setattr(task, field, value)
    if "status" in changes and changes["status"] != old_status:
        log_activity(
            db, admin, "Status Changed",
            f"Task '{task.title}' status: {old_status} → {changes['status']}", task.project_id,
        )
        notify_project_client(
            db, task.project, f"Task update on {task.project.name}",
            f"'{task.title}' moved from {old_status} to {changes['status']}",
        )
    elif "priority" in changes and changes["priority"] != old_priority:
        log_activity(
            db, admin, "Priority Changed",
            f"Task '{task.title}' priority: {old_priority} → {changes['priority']}", task.project_id,
        )
    else:
        log_activity(db, admin, "Task Updated", f"Task '{task.title}' updated", task.project_id)
    db.commit()
    db.refresh(task)
    return serialize_task(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    log_activity(db, admin, "Task Deleted", f"Task '{task.title}' deleted", task.project_id)
    db.delete(task)
    db.commit()
