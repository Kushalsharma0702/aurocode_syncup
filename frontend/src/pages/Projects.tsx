import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ProjectStatusBadge } from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import ProgressBar from "../components/ProgressBar";
import ProjectFormModal from "../components/ProjectFormModal";
import Spinner from "../components/Spinner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Page, Project, PROJECT_STATUSES } from "../types";

const PAGE_SIZE = 10;

export default function Projects() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", { search, status, page }],
    queryFn: () =>
      api
        .get<Page<Project>>("/projects", { params: { search, status: status || undefined, page, page_size: PAGE_SIZE } })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Projects</h1>
          <p className="mt-1 text-sm text-ink3">
            {isAdmin ? "Manage project proposals." : "Your project proposals."}
          </p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            + New Proposal
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          className="input sm:max-w-xs"
          placeholder="Search by project or client name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="input sm:max-w-[180px]"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="card mt-4 overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState message="No projects found." />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="divide-y divide-line md:hidden">
              {data.items.map((project) => (
                <li key={project.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/projects/${project.id}`} className="min-w-0 font-medium text-brand hover:underline">
                      {project.name}
                    </Link>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink4">
                    {project.client_name} · {project.completed_task_count}/{project.task_count} tasks ·{" "}
                    {project.budget || "no budget set"}
                  </p>
                  <div className="mt-3">
                    <ProgressBar value={project.progress} />
                  </div>
                  {isAdmin && (
                    <div className="mt-3 flex gap-4">
                      <button
                        className="text-sm font-medium text-brand"
                        onClick={() => { setEditing(project); setModalOpen(true); }}
                      >
                        Edit
                      </button>
                      <button className="text-sm font-medium text-danger" onClick={() => setDeleting(project)}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-line bg-muted/70">
                  <tr>
                    <th className="table-head">Project</th>
                    <th className="table-head">Client</th>
                    <th className="table-head">Status</th>
                    <th className="table-head w-48">Progress</th>
                    <th className="table-head">Budget</th>
                    {isAdmin && <th className="table-head text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((project) => (
                    <tr key={project.id} className="hover:bg-muted/60">
                      <td className="table-cell">
                        <Link to={`/projects/${project.id}`} className="font-medium text-brand hover:underline">
                          {project.name}
                        </Link>
                        <p className="text-xs text-ink4">
                          {project.completed_task_count}/{project.task_count} tasks done
                        </p>
                      </td>
                      <td className="table-cell">{project.client_name}</td>
                      <td className="table-cell">
                        <ProjectStatusBadge status={project.status} />
                      </td>
                      <td className="table-cell">
                        <ProgressBar value={project.progress} />
                      </td>
                      <td className="table-cell">{project.budget || "—"}</td>
                      {isAdmin && (
                        <td className="table-cell text-right">
                          <button
                            className="text-sm font-medium text-brand hover:underline"
                            onClick={() => { setEditing(project); setModalOpen(true); }}
                          >
                            Edit
                          </button>
                          <button
                            className="ml-3 text-sm font-medium text-danger hover:underline"
                            onClick={() => setDeleting(project)}
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

      <ProjectFormModal open={modalOpen} onClose={() => setModalOpen(false)} project={editing} />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete Proposal"
        message={`Delete "${deleting?.name}"? This removes all its tasks, comments and attachments.`}
        busy={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
