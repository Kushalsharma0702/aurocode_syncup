import { FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { PriorityBadge, ProjectStatusBadge, TaskStatusBadge } from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import ProgressBar from "../components/ProgressBar";
import Spinner from "../components/Spinner";
import TaskFormModal from "../components/TaskFormModal";
import { api, apiErrorMessage, getToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime, formatFileSize } from "../lib/format";
import { Activity, Attachment, Comment, Project, ReportLink, ReportLinkSummary, Task } from "../types";

type Tab = "overview" | "tasks" | "comments" | "timeline" | "attachments" | "share";

const baseTabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "comments", label: "Comments" },
  { id: "timeline", label: "Timeline" },
  { id: "attachments", label: "Attachments" },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const projectId = Number(id);
  const [tab, setTab] = useState<Tab>("overview");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const tabs = isAdmin ? [...baseTabs, { id: "share" as const, label: "Share" }] : baseTabs;

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.get<Project>(`/projects/${projectId}`).then((r) => r.data),
  });

  if (isLoading) return <Spinner />;
  if (!project) return <EmptyState message="Project not found." />;

  return (
    <div>
      <Link to="/projects" className="text-sm font-medium text-brand hover:underline">
        ← Back to projects
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-ink3">Client: {project.client_name}</p>
        </div>
        <div className="w-full sm:w-64">
          <p className="mb-1 text-xs font-medium text-ink3">
            Progress · {project.completed_task_count}/{project.task_count} tasks
          </p>
          <ProgressBar value={project.progress} />
        </div>
      </div>

      <div className="mt-6 border-b border-line">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium ${
                tab === t.id
                  ? "border-brand text-brand"
                  : "border-transparent text-ink3 hover:border-line2 hover:text-ink2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab project={project} />}
        {tab === "tasks" && <TasksTab projectId={projectId} />}
        {tab === "comments" && <CommentsTab projectId={projectId} />}
        {tab === "timeline" && <TimelineTab projectId={projectId} />}
        {tab === "attachments" && <AttachmentsTab projectId={projectId} />}
        {tab === "share" && <ShareTab projectId={projectId} />}
      </div>
    </div>
  );
}

function OverviewTab({ project }: { project: Project }) {
  const fields = [
    { label: "Description", value: project.description },
    { label: "Objective", value: project.objective },
    { label: "Scope", value: project.scope },
    { label: "Deliverables", value: project.deliverables },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {fields.map((f) => (
          <div key={f.label} className="card p-5">
            <h3 className="text-sm font-semibold text-ink">{f.label}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink3">{f.value || "—"}</p>
          </div>
        ))}
      </div>
      <div className="card h-fit p-5">
        <h3 className="text-sm font-semibold text-ink">Details</h3>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-ink4">Timeline</dt>
            <dd className="mt-0.5 font-medium text-ink2">{project.timeline || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink4">Budget</dt>
            <dd className="mt-0.5 font-medium text-ink2">{project.budget || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink4">Created</dt>
            <dd className="mt-0.5 font-medium text-ink2">{formatDate(project.created_at)}</dd>
          </div>
          <div>
            <dt className="text-ink4">Last Updated</dt>
            <dd className="mt-0.5 font-medium text-ink2">{formatDate(project.updated_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function TasksTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", "project", projectId],
    queryFn: () => api.get<Task[]>(`/projects/${projectId}/tasks`).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            + New Task
          </button>
        </div>
      )}
      <div className="card overflow-hidden">
        {!tasks || tasks.length === 0 ? (
          <EmptyState message="No tasks yet." />
        ) : (
          <>
          {/* Mobile: stacked cards */}
          <ul className="divide-y divide-line md:hidden">
            {tasks.map((task) => (
              <li key={task.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-ink">{task.title}</p>
                  <TaskStatusBadge status={task.status} />
                </div>
                {task.description && <p className="mt-1 text-xs text-ink4">{task.description}</p>}
                <p className="mt-1 text-xs text-ink4">
                  {task.assigned_to && <>{task.assigned_to} · </>}
                  due {formatDate(task.due_date)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <PriorityBadge priority={task.priority} />
                  {isAdmin && (
                    <div className="flex gap-4">
                      <button
                        className="text-sm font-medium text-brand"
                        onClick={() => { setEditing(task); setModalOpen(true); }}
                      >
                        Edit
                      </button>
                      <button className="text-sm font-medium text-danger" onClick={() => setDeleting(task)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[680px]">
            <thead className="border-b border-line bg-muted/70">
              <tr>
                <th className="table-head">Task</th>
                <th className="table-head">Assigned To</th>
                <th className="table-head">Priority</th>
                <th className="table-head">Status</th>
                <th className="table-head">Due Date</th>
                {isAdmin && <th className="table-head text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-muted/60">
                  <td className="table-cell">
                    <p className="font-medium text-ink">{task.title}</p>
                    {task.description && <p className="mt-0.5 text-xs text-ink4">{task.description}</p>}
                  </td>
                  <td className="table-cell">{task.assigned_to || "—"}</td>
                  <td className="table-cell"><PriorityBadge priority={task.priority} /></td>
                  <td className="table-cell"><TaskStatusBadge status={task.status} /></td>
                  <td className="table-cell">{formatDate(task.due_date)}</td>
                  {isAdmin && (
                    <td className="table-cell text-right">
                      <button
                        className="text-sm font-medium text-brand hover:underline"
                        onClick={() => { setEditing(task); setModalOpen(true); }}
                      >
                        Edit
                      </button>
                      <button
                        className="ml-3 text-sm font-medium text-danger hover:underline"
                        onClick={() => setDeleting(task)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>
      <TaskFormModal open={modalOpen} onClose={() => setModalOpen(false)} projectId={projectId} task={editing} />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete Task"
        message={`Delete task "${deleting?.title}"?`}
        busy={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function CommentsTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Comment | null>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: ["comments", "project", projectId],
    queryFn: () => api.get<Comment[]>(`/projects/${projectId}/comments`).then((r) => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["comments"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const addMutation = useMutation({
    mutationFn: (body: { message: string }) => api.post(`/projects/${projectId}/comments`, body),
    onSuccess: () => { setMessage(""); setError(""); invalidate(); },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/comments/${id}`),
    onSuccess: () => { setDeleting(null); invalidate(); },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim()) addMutation.mutate({ message: message.trim() });
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card">
        {!comments || comments.length === 0 ? (
          <EmptyState message="No comments yet. Start the conversation below." />
        ) : (
          <ul className="divide-y divide-line">
            {comments.map((comment) => (
              <li key={comment.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                      {comment.user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {comment.user.full_name}
                        {comment.user.role === "admin" && (
                          <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand">
                            Team
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink4">{formatDateTime(comment.created_at)}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      className="text-xs font-medium text-danger hover:underline"
                      onClick={() => setDeleting(comment)}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink3">{comment.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSubmit} className="card mt-4 p-4">
        {error && (
          <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
        <label className="label">Add a comment</label>
        <textarea
          className="input"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your comment…"
          maxLength={5000}
          required
        />
        <div className="mt-3 flex justify-end">
          <button type="submit" className="btn-primary" disabled={addMutation.isPending || !message.trim()}>
            {addMutation.isPending ? "Posting…" : "Post Comment"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete Comment"
        message="Delete this comment permanently?"
        busy={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function TimelineTab({ projectId }: { projectId: number }) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["activity", "project", projectId],
    queryFn: () => api.get<Activity[]>(`/projects/${projectId}/activity`).then((r) => r.data),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="card mx-auto max-w-3xl">
      {!entries || entries.length === 0 ? (
        <EmptyState message="No activity recorded yet." />
      ) : (
        <ol className="p-5">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
              {index < entries.length - 1 && (
                <span className="absolute left-[7px] top-4 h-full w-px bg-muted" aria-hidden />
              )}
              <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-brand bg-card" />
              <div>
                <p className="text-sm text-ink2">
                  <span className="font-medium">{entry.action}</span>
                  {entry.detail && <span className="text-ink3"> — {entry.detail}</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink4">
                  {formatDateTime(entry.created_at)}
                  {entry.user && ` · ${entry.user.full_name}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ShareTab({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<ReportLinkSummary | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: links, isLoading } = useQuery({
    queryKey: ["report-links", projectId],
    queryFn: () => api.get<ReportLinkSummary[]>(`/projects/${projectId}/report-links`).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<ReportLink>(`/projects/${projectId}/report-links`).then((r) => r.data),
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: ["report-links", projectId] });
      navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${projectId}/report-links/${id}`),
    onSuccess: () => {
      setRevoking(null);
      queryClient.invalidateQueries({ queryKey: ["report-links", projectId] });
    },
  });

  if (isLoading) return <Spinner />;

  const active = (links ?? []).filter((link) => !link.revoked_at);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink3">Share a read-only report link with your client — no login required.</p>
        <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating…" : "+ New Link"}
        </button>
      </div>
      <div className="card">
        {active.length === 0 ? (
          <EmptyState message="No active report links yet." />
        ) : (
          <ul className="divide-y divide-line">
            {active.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Link #{link.id}
                    {copiedId === link.id && <span className="ml-2 text-xs text-ok">Copied!</span>}
                  </p>
                  <p className="text-xs text-ink4">
                    Created {formatDate(link.created_at)} · Expires {formatDate(link.expires_at)} · Viewed{" "}
                    {link.view_count}×
                  </p>
                </div>
                <button className="text-sm font-medium text-danger hover:underline" onClick={() => setRevoking(link)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={revoking !== null}
        title="Revoke Report Link"
        message="Anyone with this link will lose access immediately."
        busy={revokeMutation.isPending}
        onConfirm={() => revoking && revokeMutation.mutate(revoking.id)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

function AttachmentsTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Attachment | null>(null);

  const { data: attachments, isLoading } = useQuery({
    queryKey: ["attachments", projectId],
    queryFn: () => api.get<Attachment[]>(`/projects/${projectId}/attachments`).then((r) => r.data),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.post(`/projects/${projectId}/attachments`, formData);
    },
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["attachments", projectId] });
      if (fileInput.current) fileInput.current.value = "";
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ["attachments", projectId] });
    },
  });

  const download = async (attachment: Attachment) => {
    const res = await fetch(`/api/attachments/${attachment.id}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.original_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      {isAdmin && (
        <div className="card mb-4 p-4">
          {error && (
            <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <label className="label">Upload attachment</label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              className="block w-full text-sm text-ink3 file:mr-3 file:rounded-md file:border-0 file:bg-brand/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-brand/15"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
              }}
              disabled={uploadMutation.isPending}
            />
            {uploadMutation.isPending && <span className="text-sm text-ink4">Uploading…</span>}
          </div>
        </div>
      )}

      <div className="card">
        {!attachments || attachments.length === 0 ? (
          <EmptyState message="No attachments yet." />
        ) : (
          <ul className="divide-y divide-line">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <svg className="h-8 w-8 shrink-0 text-ink4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{attachment.original_name}</p>
                    <p className="text-xs text-ink4">
                      {formatFileSize(attachment.size)} · {formatDate(attachment.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    className="text-sm font-medium text-brand hover:underline"
                    onClick={() => download(attachment)}
                  >
                    Download
                  </button>
                  {isAdmin && (
                    <button
                      className="text-sm font-medium text-danger hover:underline"
                      onClick={() => setDeleting(attachment)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete Attachment"
        message={`Delete "${deleting?.original_name}"?`}
        busy={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
