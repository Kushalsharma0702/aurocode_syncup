import { ProjectStatus, TaskPriority, TaskStatus } from "../types";

const projectStatusStyles: Record<ProjectStatus, string> = {
  Draft: "bg-muted text-ink2 ring-line2",
  Sent: "bg-info/10 text-info ring-info/30",
  "In Review": "bg-warn/10 text-warn ring-warn/30",
  Approved: "bg-ok/10 text-ok ring-ok/30",
  Rejected: "bg-danger/10 text-danger ring-danger/30",
  Completed: "bg-brand/10 text-brand ring-brand/30",
};

const taskStatusStyles: Record<TaskStatus, string> = {
  Pending: "bg-muted text-ink2 ring-line2",
  "In Progress": "bg-info/10 text-info ring-info/30",
  Blocked: "bg-danger/10 text-danger ring-danger/30",
  Completed: "bg-ok/10 text-ok ring-ok/30",
};

const priorityStyles: Record<TaskPriority, string> = {
  Low: "bg-muted text-ink3 ring-line2",
  Medium: "bg-info/10 text-info ring-info/30",
  High: "bg-high/10 text-high ring-high/30",
  Critical: "bg-danger/10 text-danger ring-danger/30",
};

function badgeClass(style: string) {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={badgeClass(projectStatusStyles[status])}>{status}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={badgeClass(taskStatusStyles[status])}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={badgeClass(priorityStyles[priority])}>{priority}</span>;
}
