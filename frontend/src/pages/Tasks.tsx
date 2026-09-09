import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PriorityBadge, TaskStatusBadge } from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import Spinner from "../components/Spinner";
import TaskFormModal from "../components/TaskFormModal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";
import { Page, Task, TASK_PRIORITIES, TASK_STATUSES } from "../types";

const PAGE_SIZE = 10;

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", { search, status, priority, page }],
    queryFn: () =>
      api
        .get<Page<Task>>("/tasks", {
          params: {
            search,
            status: status || undefined,
            priority: priority || undefined,
            page,
            page_size: PAGE_SIZE,
          },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
  });

  const resetPage = () => setPage(1);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Tasks</h1>
          <p className="mt-1 text-sm text-ink3">
            {isAdmin ? "Manage tasks across all projects." : "All tasks across your projects."}
          </p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            + New Task
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          className="input sm:max-w-xs"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
        />
        <select className="input sm:max-w-[170px]" value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}>
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input sm:max-w-[170px]" value={priority} onChange={(e) => { setPriority(e.target.value); resetPage(); }}>
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="card mt-4 overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState message="No tasks found." />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="divide-y divide-line md:hidden">
              {data.items.map((task) => (
                <li key={task.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium text-ink">{task.title}</p>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink4">
                    <Link to={`/projects/${task.project_id}`} className="text-brand hover:underline">
                      {task.project_name}
                    </Link>
                    {task.assigned_to && <> · {task.assigned_to}</>}
                    {task.due_date && <> · due {formatDate(task.due_date)}</>}
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
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-line bg-muted/70">
                <tr>
                  <th className="table-head">Task</th>
                  <th className="table-head">Project</th>
                  <th className="table-head">Assigned To</th>
                  <th className="table-head">Priority</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Due Date</th>
                  {isAdmin && <th className="table-head text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((task) => (
                  <tr key={task.id} className="hover:bg-muted/60">
                    <td className="table-cell font-medium text-ink">{task.title}</td>
                    <td className="table-cell">
                      <Link to={`/projects/${task.project_id}`} className="text-brand hover:underline">
                        {task.project_name}
                      </Link>
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
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </>
        )}
      </div>

      <TaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editing}
        projectId={editing?.project_id}
      />
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
