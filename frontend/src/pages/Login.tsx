import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import MsmeBadge from "../components/MsmeBadge";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page p-4">
      {/* Subtle glow accents */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 right-0 h-80 w-96 rounded-full bg-brand/5 blur-3xl" />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/logo.png"
            alt="Aurocode"
            className="mx-auto h-14 w-14 rounded-2xl ring-1 ring-line"
          />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
            SyncUp<span className="text-brand">.</span>
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-ink4">
            Aurocode · Client Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          <h2 className="text-base font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink4">Use the credentials provided by your project team.</p>

          {error && (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <div className="mt-5">
            <label htmlFor="username" className="label">
              Username
            </label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="mt-4">
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.18em] text-ink4">
          Code That Illuminates
        </p>
        <div className="mt-3 flex justify-center">
          <MsmeBadge />
        </div>
      </div>
    </div>
  );
}
