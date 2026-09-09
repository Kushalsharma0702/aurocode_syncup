import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Notification, Page } from "../types";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api.get<{ unread: number }>("/notifications/unread-count").then((r) => r.data.unread),
    refetchInterval: 30_000,
  });

  const { data: list } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () =>
      api.get<Page<Notification>>("/notifications", { params: { page_size: 15 } }).then((r) => r.data.items),
    enabled: open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: invalidate,
  });

  const handleClick = (notification: Notification) => {
    if (!notification.read_at) markRead.mutate(notification.id);
    setOpen(false);
    if (notification.project_id) navigate(`/projects/${notification.project_id}`);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-ink3 hover:bg-muted hover:text-ink"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {(unread ?? 0) > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
            {unread! > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] sm:w-96">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">Notifications</h3>
                {(unread ?? 0) > 0 && (
                  <button
                    className="text-xs font-medium text-brand hover:text-brand/80"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {!list || list.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink4">You're all caught up.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.map((notification) => (
                      <li key={notification.id}>
                        <button
                          onClick={() => handleClick(notification)}
                          className={`block w-full px-4 py-3 text-left hover:bg-muted/60 ${
                            notification.read_at ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!notification.read_at && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink">{notification.title}</p>
                              {notification.body && (
                                <p className="mt-0.5 line-clamp-2 text-xs text-ink3">{notification.body}</p>
                              )}
                              <p className="mt-1 text-xs text-ink4">{formatDateTime(notification.created_at)}</p>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
