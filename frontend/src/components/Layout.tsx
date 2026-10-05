import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import MsmeBadge from "./MsmeBadge";
import NotificationBell from "./NotificationBell";
import StatusBanner from "./StatusBanner";

const baseNav = [
  { to: "/dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" },
  { to: "/projects", label: "Projects", icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" },
  { to: "/tasks", label: "Tasks", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { to: "/comments", label: "Comments", icon: "M8 10h8m-8 4h4m-6 6l-3 1 1-3.5A8 8 0 1121 12a8 8 0 01-9 7.9L7 20z" },
  { to: "/messages", label: "Messages", icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" },
  { to: "/profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { to: "/status", label: "System Status", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
];

const adminNav = [
  { to: "/clients", label: "Clients", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-8a3 3 0 11-3-3" },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/projects": "Projects",
  "/tasks": "Tasks",
  "/comments": "Comments",
  "/messages": "Messages",
  "/clients": "Clients",
  "/profile": "Profile",
  "/status": "System Status",
};

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt="Aurocode" className="h-8 w-8 rounded-lg ring-1 ring-line" />
      <div className="leading-tight">
        <p className="text-[15px] font-semibold tracking-tight text-ink">
          SyncUp<span className="text-brand">.</span>
        </p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink4">Aurocode</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const nav = user?.role === "admin"
    ? [...baseNav.slice(0, 5), ...adminNav, ...baseNav.slice(5)]
    : baseNav;

  const { data: chatUnread } = useQuery({
    queryKey: ["chat", "unread"],
    queryFn: () => api.get<{ unread: number }>("/chat/unread-count").then((r) => r.data.unread),
    refetchInterval: 15_000,
  });
  const title = location.pathname.startsWith("/projects/")
    ? "Projects"
    : pageTitles[location.pathname] ?? "SyncUp";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navLinks = (
    <nav className="flex-1 space-y-0.5 px-3 py-4">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-brand/10 text-brand"
                : "text-ink3 hover:bg-muted/70 hover:text-ink"
            }`
          }
        >
          <NavIcon d={item.icon} />
          <span className="flex-1">{item.label}</span>
          {item.to === "/messages" && (chatUnread ?? 0) > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-fg">
              {chatUnread! > 99 ? "99+" : chatUnread}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r border-line bg-card/60 lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Brand />
        </div>
        {navLinks}
        <div className="border-t border-line px-5 py-4 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink4">Code That Illuminates</p>
          <MsmeBadge />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-page/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
              className="rounded-lg p-2 text-ink3 hover:bg-muted lg:hidden"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="lg:hidden">
              <Brand />
            </span>
            <h1 className="hidden text-sm font-medium text-ink4 lg:block">{title}</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                  {user?.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-medium leading-tight text-ink">{user?.full_name}</p>
                  <p className="text-xs capitalize leading-tight text-ink4">{user?.role}</p>
                </div>
                <svg className="hidden h-4 w-4 text-ink4 sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                  <div className="card absolute right-0 z-40 mt-2 w-44 overflow-hidden py-1">
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-ink2 hover:bg-muted/70"
                      onClick={() => { setUserMenuOpen(false); navigate("/profile"); }}
                    >
                      Profile & sessions
                    </button>
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-muted/70"
                      onClick={handleLogout}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Mobile nav drawer */}
        {menuOpen && (
          <div className="border-b border-line bg-card/95 lg:hidden">{navLinks}</div>
        )}

        {/* Global status banner — only shows when there's an active incident/maintenance */}
        <StatusBanner />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
