import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

type StatusType = "operational" | "maintenance" | "degraded" | "incident";

interface StatusEntry {
  id: number;
  title: string;
  message: string;
  type: StatusType;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  author: { full_name: string; username: string };
}

const TYPE_META: Record<StatusType, { label: string; color: string; dot: string }> = {
  operational: {
    label: "Operational",
    color: "bg-ok/10 text-ok ring-ok/30",
    dot: "bg-ok",
  },
  maintenance: {
    label: "Maintenance",
    color: "bg-warn/10 text-warn ring-warn/30",
    dot: "bg-warn",
  },
  degraded: {
    label: "Degraded",
    color: "bg-orange-500/10 text-orange-500 ring-orange-400/30",
    dot: "bg-orange-500",
  },
  incident: {
    label: "Incident",
    color: "bg-danger/10 text-danger ring-danger/30",
    dot: "bg-danger",
  },
};

function StatusBadge({ type }: { type: StatusType }) {
  const m = TYPE_META[type] ?? TYPE_META.operational;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const BLANK = { title: "", message: "", type: "operational" as StatusType };

export default function SystemStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();

  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [editing, setEditing] = useState<StatusEntry | null>(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [editError, setEditError] = useState("");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["status"],
    queryFn: () => api.get<StatusEntry[]>("/status").then((r) => r.data),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["status"] });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post("/status", body),
    onSuccess: () => { invalidate(); setForm(BLANK); setError(""); },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/status/${id}/resolve`),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/status/${id}`),
    onSuccess: () => { invalidate(); setConfirmDelete(null); },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: typeof editForm }) =>
      api.patch(`/status/${id}`, body),
    onSuccess: () => { invalidate(); setEditing(null); setEditError(""); },
    onError: (e) => setEditError(apiErrorMessage(e)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const openEdit = (entry: StatusEntry) => {
    setEditing(entry);
    setEditForm({ title: entry.title, message: entry.message, type: entry.type });
    setEditError("");
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (editing) editMutation.mutate({ id: editing.id, body: editForm });
  };

  // Latest active (unresolved, non-operational) entry for the banner at top
  const active = entries?.find((e) => e.type !== "operational" && !e.resolved_at);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-ink">System Status</h1>
        <p className="mt-1 text-sm text-ink3">
          Real-time server health and maintenance log.
        </p>
      </div>

      {/* Current status banner */}
      <div className={`flex items-start gap-3 rounded-xl border px-5 py-4 ${
        active
          ? active.type === "incident"
            ? "border-danger/30 bg-danger/5"
            : active.type === "degraded"
            ? "border-orange-400/30 bg-orange-500/5"
            : "border-warn/30 bg-warn/5"
          : "border-ok/30 bg-ok/5"
      }`}>
        <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
          active
            ? active.type === "incident" ? "bg-danger animate-pulse"
            : active.type === "degraded" ? "bg-orange-500 animate-pulse"
            : "bg-warn animate-pulse"
            : "bg-ok"
        }`} />
        <div className="min-w-0">
          {active ? (
            <>
              <p className="font-semibold text-ink">{active.title}</p>
              <p className="mt-0.5 text-sm text-ink3">{active.message}</p>
              <p className="mt-1 text-xs text-ink4">
                Posted by {active.author.full_name} · {fmt(active.created_at)}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-ok">All systems operational</p>
              <p className="mt-0.5 text-sm text-ink3">No active incidents or maintenance windows.</p>
            </>
          )}
        </div>
        {active && isAdmin && (
          <button
            className="ml-auto shrink-0 rounded-lg border border-ok/40 bg-ok/10 px-3 py-1 text-xs font-medium text-ok hover:bg-ok/20"
            onClick={() => resolveMutation.mutate(active.id)}
            disabled={resolveMutation.isPending}
          >
            Mark resolved
          </button>
        )}
      </div>

      {/* Admin: post new status */}
      {isAdmin && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink4">
            Post Status Update
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label">Title *</label>
                <input
                  className="input"
                  placeholder="e.g. Scheduled maintenance tonight"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <label className="label">Type *</label>
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as StatusType }))}
                >
                  <option value="operational">Operational</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="degraded">Degraded</option>
                  <option value="incident">Incident</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Message *</label>
              <textarea
                className="input min-h-[80px] resize-y"
                placeholder="Describe what is happening or what to expect…"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
                maxLength={2000}
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Posting…" : "Post Update"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status log */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink4">Status History</h2>

        {isLoading ? (
          <Spinner />
        ) : !entries || entries.length === 0 ? (
          <EmptyState message="No status updates posted yet." />
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className={`card overflow-hidden ${entry.resolved_at ? "opacity-60" : ""}`}>
                {/* Main row */}
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  {/* Left dot */}
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_META[entry.type as StatusType]?.dot ?? "bg-ok"}`} />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{entry.title}</span>
                      <StatusBadge type={entry.type as StatusType} />
                      {entry.resolved_at && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-ink4 ring-1 ring-inset ring-line2">
                          Resolved
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink3">{entry.message}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink4">
                      <span>Posted by <span className="font-medium text-ink3">{entry.author.full_name}</span></span>
                      <span>Created: {fmt(entry.created_at)}</span>
                      {entry.updated_at !== entry.created_at && (
                        <span>Updated: {fmt(entry.updated_at)}</span>
                      )}
                      {entry.resolved_at && (
                        <span className="text-ok">Resolved: {fmt(entry.resolved_at)}</span>
                      )}
                    </div>
                  </div>

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {!entry.resolved_at && entry.type !== "operational" && (
                        <button
                          className="rounded-lg border border-ok/40 bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok hover:bg-ok/20"
                          onClick={() => resolveMutation.mutate(entry.id)}
                          disabled={resolveMutation.isPending}
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          editing?.id === entry.id
                            ? "border-brand/40 bg-brand/10 text-brand"
                            : "border-line2 bg-muted/60 text-ink3 hover:bg-muted hover:text-ink"
                        }`}
                        onClick={() => editing?.id === entry.id ? setEditing(null) : openEdit(entry)}
                      >
                        {editing?.id === entry.id ? "Cancel" : "Edit"}
                      </button>
                      {confirmDelete === entry.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-ink3">Delete?</span>
                          <button
                            className="rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/20"
                            onClick={() => deleteMutation.mutate(entry.id)}
                            disabled={deleteMutation.isPending}
                          >
                            Yes
                          </button>
                          <button
                            className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-ink3 hover:bg-muted/80"
                            onClick={() => setConfirmDelete(null)}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                          onClick={() => setConfirmDelete(entry.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline edit form */}
                {isAdmin && editing?.id === entry.id && (
                  <form
                    onSubmit={handleEditSubmit}
                    className="border-t border-line bg-muted/40 px-4 py-4 space-y-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink4">Edit Status</p>
                    {editError && (
                      <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                        {editError}
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="label">Title</label>
                        <input
                          className="input"
                          value={editForm.title}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          required
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label className="label">Type</label>
                        <select
                          className="input"
                          value={editForm.type}
                          onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as StatusType }))}
                        >
                          <option value="operational">Operational</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="degraded">Degraded</option>
                          <option value="incident">Incident</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Message</label>
                      <textarea
                        className="input min-h-[70px] resize-y"
                        value={editForm.message}
                        onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))}
                        required
                        maxLength={2000}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" disabled={editMutation.isPending}>
                        {editMutation.isPending ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
