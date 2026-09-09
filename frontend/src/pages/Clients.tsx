import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import { api, apiErrorMessage } from "../lib/api";
import { formatDate } from "../lib/format";
import { User } from "../types";

export default function Clients() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ username: "", full_name: "", password: "" });
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<User[]>("/users").then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["clients"] });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post("/users", body),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setForm({ username: "", full_name: "", password: "" });
      setError("");
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: (client: User) => api.patch(`/users/${client.id}`, { is_active: !client.is_active }),
    onSuccess: invalidate,
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api.patch(`/users/${id}`, { password }),
    onSuccess: () => {
      setResetting(null);
      setNewPassword("");
      setResetError("");
    },
    onError: (err) => setResetError(apiErrorMessage(err)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Clients</h1>
          <p className="mt-1 text-sm text-ink3">Manage client accounts and portal access.</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(""); setModalOpen(true); }}>
          + New Client
        </button>
      </div>

      <div className="card mt-5 overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : !clients || clients.length === 0 ? (
          <EmptyState message="No client accounts yet." />
        ) : (
          <>
          {/* Mobile: stacked cards */}
          <ul className="divide-y divide-line md:hidden">
            {clients.map((client) => (
              <li key={client.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{client.full_name}</p>
                    <p className="text-xs text-ink4">
                      @{client.username} · joined {formatDate(client.created_at)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      client.is_active
                        ? "bg-ok/10 text-ok ring-ok/30"
                        : "bg-muted text-ink3 ring-line2"
                    }`}
                  >
                    {client.is_active ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="mt-3 flex gap-4">
                  <button
                    className="text-sm font-medium text-brand"
                    onClick={() => { setResetting(client); setNewPassword(""); setResetError(""); }}
                  >
                    Reset password
                  </button>
                  <button
                    className={`text-sm font-medium ${client.is_active ? "text-danger" : "text-ok"}`}
                    onClick={() => toggleMutation.mutate(client)}
                    disabled={toggleMutation.isPending}
                  >
                    {client.is_active ? "Disable" : "Enable"}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-line bg-muted/70">
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">Username</th>
                <th className="table-head">Status</th>
                <th className="table-head">Created</th>
                <th className="table-head text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-muted/60">
                  <td className="table-cell font-medium text-ink">{client.full_name}</td>
                  <td className="table-cell">{client.username}</td>
                  <td className="table-cell">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        client.is_active
                          ? "bg-ok/10 text-ok ring-ok/30"
                          : "bg-muted text-ink3 ring-line2"
                      }`}
                    >
                      {client.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="table-cell">{formatDate(client.created_at)}</td>
                  <td className="table-cell text-right">
                    <button
                      className="text-sm font-medium text-brand hover:underline"
                      onClick={() => { setResetting(client); setNewPassword(""); setResetError(""); }}
                    >
                      Reset password
                    </button>
                    <button
                      className={`ml-3 text-sm font-medium hover:underline ${
                        client.is_active ? "text-danger" : "text-ok"
                      }`}
                      onClick={() => toggleMutation.mutate(client)}
                      disabled={toggleMutation.isPending}
                    >
                      {client.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      <Modal
        title={`Reset password — ${resetting?.full_name ?? ""}`}
        open={resetting !== null}
        onClose={() => setResetting(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (resetting) resetMutation.mutate({ id: resetting.id, password: newPassword });
          }}
          className="space-y-4"
        >
          {resetError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {resetError}
            </div>
          )}
          <p className="text-sm text-ink3">
            Set a new password for <span className="font-medium text-ink">@{resetting?.username}</span> and
            share it with them securely.
          </p>
          <div>
            <label className="label">New Password *</label>
            <input
              type="text"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              maxLength={128}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setResetting(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={resetMutation.isPending}>
              {resetMutation.isPending ? "Saving…" : "Set Password"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal title="New Client Account" open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          )}
          <div>
            <label className="label">Full Name *</label>
            <input
              className="input"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              required
              maxLength={100}
            />
          </div>
          <div>
            <label className="label">Username *</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
              minLength={3}
              maxLength={50}
              pattern="[a-zA-Z0-9_.\-]+"
              title="Letters, numbers, dots, dashes and underscores only"
            />
          </div>
          <div>
            <label className="label">Password *</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={6}
              maxLength={128}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Client"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
