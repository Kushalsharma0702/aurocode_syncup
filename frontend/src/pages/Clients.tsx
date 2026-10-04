import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import { api, apiErrorMessage } from "../lib/api";
import { formatDate } from "../lib/format";
import { ClientAccessLink, User } from "../types";

export default function Clients() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ username: "", full_name: "", password: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [linkFor, setLinkFor] = useState<User | null>(null);
  const [link, setLink] = useState<ClientAccessLink | null>(null);
  const [linkError, setLinkError] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [contact, setContact] = useState({ email: "", phone: "" });

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
      setForm({ username: "", full_name: "", password: "", email: "", phone: "" });
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

  const linkMutation = useMutation({
    mutationFn: ({ id, send }: { id: number; send: boolean }) =>
      api.post<ClientAccessLink>(`/users/${id}/access-link?send=${send}`).then((r) => r.data),
    onSuccess: (data) => { setLink(data); setLinkError(""); },
    onError: (err) => setLinkError(apiErrorMessage(err)),
  });

  const revokeLinkMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}/access-link`),
    onSuccess: () => { setLink(null); setLinkFor(null); },
  });

  const contactMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; email: string; phone: string }) =>
      api.patch(`/users/${id}`, body),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const openLink = (client: User) => {
    setLinkFor(client);
    setLink(null);
    setLinkError("");
    setCopied(false);
    linkMutation.mutate({ id: client.id, send: false });
  };

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
                    <p className="mt-0.5 truncate text-xs text-ink4">
                      {client.email || <span className="text-danger">No email</span>}
                      {client.phone ? ` · ${client.phone}` : ""}
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
                <div className="mt-3 flex flex-wrap gap-4">
                  <button className="text-sm font-medium text-brand" onClick={() => openLink(client)}>
                    Send access link
                  </button>
                  <button
                    className="text-sm font-medium text-ink2"
                    onClick={() => { setEditing(client); setContact({ email: client.email, phone: client.phone }); }}
                  >
                    Contact
                  </button>
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
                <th className="table-head">Contact</th>
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
                    {client.email ? (
                      <span className="text-ink2">{client.email}</span>
                    ) : (
                      <span className="text-danger">No email</span>
                    )}
                    {client.phone && <span className="block text-xs text-ink4">{client.phone}</span>}
                  </td>
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
                      onClick={() => openLink(client)}
                    >
                      Send access link
                    </button>
                    <button
                      className="ml-3 text-sm font-medium text-ink2 hover:underline"
                      onClick={() => { setEditing(client); setContact({ email: client.email, phone: client.phone }); }}
                    >
                      Contact
                    </button>
                    <button
                      className="ml-3 text-sm font-medium text-brand hover:underline"
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

      <Modal
        title={`Contact details — ${editing?.full_name ?? ""}`}
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editing) contactMutation.mutate({ id: editing.id, ...contact });
          }}
          className="space-y-4"
        >
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              maxLength={255}
            />
          </div>
          <div>
            <label className="label">Phone (WhatsApp)</label>
            <input
              type="tel"
              className="input"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              maxLength={20}
              pattern="[0-9+\- ]*"
              placeholder="+91 98765 43210"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={contactMutation.isPending}>
              {contactMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Access link — ${linkFor?.full_name ?? ""}`}
        open={linkFor !== null}
        onClose={() => { setLinkFor(null); setLink(null); }}
      >
        <div className="space-y-4">
          {linkError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {linkError}
            </div>
          )}
          <p className="text-sm text-ink3">
            This signs {linkFor?.full_name} in with no password. Anyone holding the link can open their
            portal, so send it directly to them — and revoke it if it goes astray.
          </p>

          {linkMutation.isPending && !link ? (
            <Spinner />
          ) : link ? (
            <>
              <div className="rounded-md border border-line bg-muted/50 p-3">
                <code className="block break-all text-xs text-ink2">{link.url}</code>
              </div>
              <p className="text-xs text-ink4">Works until {formatDate(link.expires_at)}.</p>

              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(link.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>

                {link.whatsapp_url ? (
                  <a className="btn-primary" href={link.whatsapp_url} target="_blank" rel="noreferrer">
                    Share on WhatsApp
                  </a>
                ) : (
                  <span className="self-center text-xs text-ink4">
                    Add a phone number to share on WhatsApp.
                  </span>
                )}

                {linkFor?.email && (
                  <button
                    className="btn-secondary"
                    onClick={() => linkFor && linkMutation.mutate({ id: linkFor.id, send: true })}
                    disabled={linkMutation.isPending}
                  >
                    Email it to them
                  </button>
                )}
              </div>

              <div className="border-t border-line pt-3">
                <button
                  className="text-sm font-medium text-danger hover:underline"
                  onClick={() => linkFor && revokeLinkMutation.mutate(linkFor.id)}
                  disabled={revokeLinkMutation.isPending}
                >
                  Revoke this link
                </button>
              </div>
            </>
          ) : null}
        </div>
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
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              maxLength={255}
              placeholder="riya@example.com"
            />
            <p className="mt-1 text-xs text-ink4">
              Without an email they won't hear about anything that happens in the portal.
            </p>
          </div>
          <div>
            <label className="label">Phone (WhatsApp)</label>
            <input
              type="tel"
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              maxLength={20}
              pattern="[0-9+\- ]*"
              placeholder="+91 98765 43210"
            />
            <p className="mt-1 text-xs text-ink4">Include the country code so WhatsApp links work.</p>
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
            <p className="mt-1 text-xs text-ink4">
              A fallback only — prefer sending them an access link, which needs no password.
            </p>
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
