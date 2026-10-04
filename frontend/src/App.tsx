import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Spinner from "./components/Spinner";
import { useAuth } from "./lib/auth";
import Clients from "./pages/Clients";
import Comments from "./pages/Comments";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Legal from "./pages/Legal";
import MagicLink from "./pages/MagicLink";
import Messages from "./pages/Messages";
import Profile from "./pages/Profile";
import ProjectDetail from "./pages/ProjectDetail";
import Projects from "./pages/Projects";
import PublicReport from "./pages/PublicReport";
import Tasks from "./pages/Tasks";
import SystemStatus from "./pages/SystemStatus";

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* Public, unauthenticated report link — no login required, available regardless of auth state. */}
      <Route path="/r/:token" element={<PublicReport />} />
      {/* Magic-link sign-in. Handled before the auth gate so an expired link
          shows a useful message instead of bouncing to the login form. */}
      <Route path="/go/:token" element={<MagicLink />} />
      {/* Reachable without an account — people need to read these before signing in. */}
      <Route path="/legal/:doc" element={<Legal />} />
      <Route path="*" element={<AuthenticatedApp user={user} loading={loading} />} />
    </Routes>
  );
}

function AuthenticatedApp({ user, loading }: { user: ReturnType<typeof useAuth>["user"]; loading: boolean }) {
  if (loading) return <Spinner />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/comments" element={<Comments />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/profile" element={<Profile />} />
        {user.role === "admin" && <Route path="/clients" element={<Clients />} />}
        <Route path="/status" element={<SystemStatus />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
