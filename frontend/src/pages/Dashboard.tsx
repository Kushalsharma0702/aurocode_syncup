import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { DashboardStats } from "../types";

const statCards = [
  {
    key: "total_projects",
    label: "Total Projects",
    color: "bg-brand/10 text-brand",
    icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  },
  {
    key: "active_projects",
    label: "Active Projects",
    color: "bg-info/10 text-info",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    key: "completed_projects",
    label: "Completed Projects",
    color: "bg-ok/10 text-ok",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    key: "pending_tasks",
    label: "Pending Tasks",
    color: "bg-warn/10 text-warn",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
] as const;

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardStats>("/dashboard").then((r) => r.data),
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-ink3">Overview of your projects and recent activity.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.key} className="card flex items-center gap-4 p-5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${card.color}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-semibold leading-tight text-ink">{data[card.key]}</p>
              <p className="mt-0.5 text-xs font-medium text-ink4">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-6">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Recent Activity</h2>
          <Link to="/projects" className="text-sm font-medium text-brand hover:text-brand/80">
            View projects →
          </Link>
        </div>
        {data.recent_activity.length === 0 ? (
          <EmptyState message="No activity yet." />
        ) : (
          <ul className="divide-y divide-line">
            {data.recent_activity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink2">
                    <span className="font-medium">{entry.action}</span>
                    {entry.detail && <span className="text-ink3"> — {entry.detail}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink4">
                    {formatDateTime(entry.created_at)}
                    {entry.project_name && entry.project_id && (
                      <>
                        {" · "}
                        <Link to={`/projects/${entry.project_id}`} className="text-brand hover:underline">
                          {entry.project_name}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
