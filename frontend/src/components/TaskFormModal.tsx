import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "./Modal";
import { api, apiErrorMessage } from "../lib/api";
import { Page, Project, Task, TaskPriority, TaskStatus, TASK_PRIORITIES, TASK_STATUSES } from "../types";

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  projectId?: number; // omit to let the admin pick a project (create mode only)
  task?: Task | null; // null/undefined → create mode
}

interface FormState {
  title: string;
  description: string;
  assigned_to: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  assigned_to: "",
  priority: "Medium",
  status: "Pending",
  due_date: "",
};

export default function TaskFormModal({ open, onClose, projectId, task }: TaskFormModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedProject, setSelectedProject] = useState("");
  const [error, setError] = useState("");

  const needsProjectSelect = !task && projectId === undefined;

  const { data: projects } = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () =>
      api.get<Page<Project>>("/projects", { params: { page_size: 100 } }).then((r) => r.data.items),
    enabled: open && needsProjectSelect,
  });

  useEffect(() => {
    if (open) {
      setError("");
      setSelectedProject("");
      setForm(
        task
          ? {
              title: task.title,
              description: task.description,
              assigned_to: task.assigned_to,
              priority: task.priority,
              status: task.status,
              due_date: task.due_date ?? "",
            }
          : emptyForm
      );
    }
  }, [open, task]);

  const mutation = useMutation({
    mutationFn: (body: object) => {
      if (task) return api.put(`/tasks/${task.id}`, body);
      const target = projectId ?? Number(selectedProject);
      return api.post(`/projects/${target}/tasks`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (needsProjectSelect && !selectedProject) {
      setError("Please choose a project for this task.");
      return;
    }
    mutation.mutate({ ...form, due_date: form.due_date || null });
  };

  const set = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Modal title={task ? "Edit Task" : "New Task"} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
        {needsProjectSelect && (
          <div>
            <label className="label">Project *</label>
            <select
              className="input"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              required
            >
              <option value="">— Choose a project —</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.client_name})
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={set("title")} required maxLength={200} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={3} value={form.description} onChange={set("description")} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Assigned To</label>
            <input className="input" value={form.assigned_to} onChange={set("assigned_to")} maxLength={100} />
          </div>
          <div>
            <label className="label">Due Date</label>
            <input type="date" className="input" value={form.due_date} onChange={set("due_date")} />
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={set("priority")}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={set("status")}>
              {TASK_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : task ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
