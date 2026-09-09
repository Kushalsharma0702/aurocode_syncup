import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface StatusEntry {
  id: number;
  title: string;
  message: string;
  type: "operational" | "maintenance" | "degraded" | "incident";
  created_at: string;
  resolved_at: string | null;
}

export default function StatusBanner() {
  const navigate = useNavigate();

  const { data: entry } = useQuery({
    queryKey: ["status", "current"],
    queryFn: () => api.get<StatusEntry | null>("/status/current").then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (!entry) return null;

  const colors = {
    incident: "bg-danger/10 border-danger/30 text-danger",
    degraded: "bg-orange-500/10 border-orange-400/30 text-orange-500",
    maintenance: "bg-warn/10 border-warn/30 text-warn",
    operational: "",
  };

  const dotColors = {
    incident: "bg-danger",
    degraded: "bg-orange-500",
    maintenance: "bg-warn",
    operational: "bg-ok",
  };

  return (
    <div
      className={`flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 text-sm sm:px-6 ${colors[entry.type]}`}
      onClick={() => navigate("/status")}
    >
      <span className={`h-2 w-2 shrink-0 animate-pulse rounded-full ${dotColors[entry.type]}`} />
      <span className="font-medium">{entry.title}</span>
      <span className="hidden truncate text-xs opacity-75 sm:block">{entry.message}</span>
      <span className="ml-auto shrink-0 text-xs opacity-75">View details →</span>
    </div>
  );
}
