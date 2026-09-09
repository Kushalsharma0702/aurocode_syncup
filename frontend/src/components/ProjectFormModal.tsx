import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "./Modal";
import { api, apiErrorMessage } from "../lib/api";
import { Project, ProjectStatus, PROJECT_STATUSES, User } from "../types";

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  project?: Project | null; // null/undefined → create mode
}

interface FormState {
  name: string;
  client_name: string;
  client_id: string;
  description: string;
  objective: string;
  scope: string;
  deliverables: string;
  timeline: string;
  budget: string;
  status: ProjectStatus;
}

const emptyForm: FormState = {
  name: "",
  client_name: "",
  client_id: "",
  description: "",
  objective: "",
  scope: "",
  deliverables: "",
  timeline: "",
  budget: "",
  status: "Draft",
};

export default function ProjectFormModal({ open, onClose, project }: ProjectFormModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<User[]>("/users").then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setError("");
      setForm(
        project
          ? {
              name: project.name,
              client_name: project.client_name,
              client_id: project.client_id ? String(project.client_id) : "",
              description: project.description,
              objective: project.objective,
              scope: project.scope,
              deliverables: project.deliverables,
              timeline: project.timeline,
              budget: project.budget,
              status: project.status,
            }
          : emptyForm
      );
    }
  }, [open, project]);

  const mutation = useMutation({
    mutationFn: (body: object) =>
      project ? api.put(`/projects/${project.id}`, body) : api.post("/projects", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ ...form, client_id: form.client_id ? Number(form.client_id) : null });
  };

  const set = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Modal title={project ? "Edit Proposal" : "New Proposal"} open={open} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Project Name *</label>
            <input className="input" value={form.name} onChange={set("name")} required maxLength={200} />
          </div>
          <div>
            <label className="label">Client Name *</label>
            <input className="input" value={form.client_name} onChange={set("client_name")} required maxLength={100} />
          </div>
          <div>
            <label className="label">Client Account</label>
            <select className="input" value={form.client_id} onChange={set("client_id")}>
              <option value="">— Not linked —</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={set("status")}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Timeline</label>
            <input className="input" value={form.timeline} onChange={set("timeline")} placeholder="e.g. 12 weeks" maxLength={200} />
          </div>
          <div>
            <label className="label">Budget</label>
            <input className="input" value={form.budget} onChange={set("budget")} placeholder="e.g. $25,000" maxLength={100} />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={3} value={form.description} onChange={set("description")} />
        </div>
        <div>
          <label className="label">Objective</label>
          <textarea className="input" rows={2} value={form.objective} onChange={set("objective")} />
        </div>
        <div>
          <label className="label">Scope</label>
          <textarea className="input" rows={2} value={form.scope} onChange={set("scope")} />
        </div>
        <div>
          <label className="label">Deliverables</label>
          <textarea className="input" rows={3} value={form.deliverables} onChange={set("deliverables")} placeholder="One per line" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : project ? "Save Changes" : "Create Proposal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
