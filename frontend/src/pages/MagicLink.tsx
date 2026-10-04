import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import Spinner from "../components/Spinner";

/**
 * Landing page for /go/:token — a client opening the link we sent them.
 *
 * They should never see a password field, so this redeems the token and drops
 * them straight into the portal. Only if the link is dead do we fall back to
 * explaining what to do next.
 */
export default function MagicLink() {
  const { token } = useParams<{ token: string }>();
  const { loginWithLink } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  // StrictMode double-mounts in development; without this the token is
  // redeemed twice and the second attempt races the first.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    loginWithLink(token)
      .then(() => navigate("/", { replace: true }))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [token, loginWithLink, navigate]);

  if (!error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
        <Spinner />
        <p className="text-sm text-ink3">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">This link didn't work</h1>
        <p className="mt-2 text-sm text-ink3">{error}</p>
        <p className="mt-4 text-sm text-ink3">
          Links expire after a while and can be turned off. Ask your project contact to send a fresh one.
        </p>
        <button className="btn-secondary mt-5" onClick={() => navigate("/login", { replace: true })}>
          Sign in with a password instead
        </button>
      </div>
    </div>
  );
}
