import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Spinner from "../components/Spinner";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/format";
import { SessionInfo } from "../types";

function describeDevice(userAgent: string): string {
  if (!userAgent) return "Unknown device";
  const browser =
    userAgent.includes("Edg/") ? "Edge"
    : userAgent.includes("OPR/") ? "Opera"
    : userAgent.includes("Firefox/") ? "Firefox"
    : userAgent.includes("Chrome/") ? "Chrome"
    : userAgent.includes("Safari/") ? "Safari"
    : userAgent.split("/")[0].slice(0, 30);
  const os =
    userAgent.includes("Windows") ? "Windows"
    : userAgent.includes("Android") ? "Android"
    : userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS"
    : userAgent.includes("Mac OS") ? "macOS"
    : userAgent.includes("Linux") ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

function ActiveSessions() {
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<SessionInfo[]>("/auth/sessions").then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sessions"] });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: invalidate,
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => api.post("/auth/sessions/revoke-others"),
    onSuccess: invalidate,
  });

  const hasOthers = (sessions ?? []).some((s) => !s.is_current);

  return (
    <div className="card mt-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Active Sessions</h2>
          <p className="mt-1 text-sm text-ink4">
            You can be signed in on several devices at once. Sign out any you don't recognise.
          </p>
        </div>
        {hasOthers && (
          <button
            className="btn-secondary !py-1.5 text-xs"
            onClick={() => revokeOthersMutation.mutate()}
            disabled={revokeOthersMutation.isPending}
          >
            Sign out all other devices
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {(sessions ?? []).map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-ink3">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {describeDevice(session.user_agent)}
                    {session.is_current && (
                      <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand ring-1 ring-inset ring-brand/30">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink4">
                    {session.ip_address || "Unknown IP"} · Last active {formatDateTime(session.last_seen_at)}
                  </p>
                </div>
              </div>
              {!session.is_current && (
                <button
                  className="shrink-0 text-sm font-medium text-danger hover:underline"
                  onClick={() => revokeMutation.mutate(session.id)}
                  disabled={revokeMutation.isPending}
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      await api.patch("/users/me/password", { password });
      setPassword("");
      setConfirm("");
      setMessage({ type: "success", text: "Password updated successfully." });
    } catch (err) {
      setMessage({ type: "error", text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-ink">Profile</h1>
      <p className="mt-1 text-sm text-ink3">Your account details.</p>

      <div className="card mt-5 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-xl font-semibold text-brand">
            {user.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">{user.full_name}</p>
            <p className="text-sm text-ink3">@{user.username}</p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink4">Role</dt>
            <dd className="mt-1 text-sm font-medium capitalize text-ink2">{user.role}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink4">Member Since</dt>
            <dd className="mt-1 text-sm font-medium text-ink2">{formatDate(user.created_at)}</dd>
          </div>
        </dl>
      </div>

      <form onSubmit={handleSubmit} className="card mt-5 p-6">
        <h2 className="text-base font-semibold text-ink">Change Password</h2>
        {message && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              message.type === "success"
                ? "border-ok/30 bg-ok/10 text-ok"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {message.text}
          </div>
        )}
        <div className="mt-4">
          <label className="label">New Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
        <div className="mt-4">
          <label className="label">Confirm New Password</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
        <div className="mt-5 flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Updating…" : "Update Password"}
          </button>
        </div>
      </form>

      <ActiveSessions />
    </div>
  );
}
