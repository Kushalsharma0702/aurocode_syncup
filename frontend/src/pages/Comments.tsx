import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import Spinner from "../components/Spinner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import { Comment, Page } from "../types";

const PAGE_SIZE = 10;

export default function Comments() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Comment | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["comments", { page }],
    queryFn: () =>
      api.get<Page<Comment>>("/comments", { params: { page, page_size: PAGE_SIZE } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/comments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      setDeleting(null);
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Comments</h1>
      <p className="mt-1 text-sm text-ink3">Latest comments across your projects.</p>

      <div className="card mt-5 max-w-3xl">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState message="No comments yet." />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {data.items.map((comment) => (
                <li key={comment.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {comment.user.full_name}
                        <span className="ml-2 text-xs font-normal text-ink4">
                          on{" "}
                          <Link to={`/projects/${comment.project_id}`} className="text-brand hover:underline">
                            {comment.project_name}
                          </Link>
                        </span>
                      </p>
                      <p className="text-xs text-ink4">{formatDateTime(comment.created_at)}</p>
                    </div>
                    {isAdmin && (
                      <button
                        className="text-xs font-medium text-danger hover:underline"
                        onClick={() => setDeleting(comment)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink3">{comment.message}</p>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete Comment"
        message="Delete this comment permanently?"
        busy={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
