import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import ProgressBar from "../components/ProgressBar";
import Spinner from "../components/Spinner";
import { formatDateTime } from "../lib/format";
import { PublicReport as PublicReportData } from "../types";

export default function PublicReport() {
  const { token } = useParams();
  const [data, setData] = useState<PublicReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<PublicReportData>(`/api/public/reports/${token}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err.response?.status;
        setError(
          status === 410
            ? "This report link has expired or been revoked."
            : "This report link is invalid."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-ink">Report unavailable</h1>
          <p className="mt-2 text-sm text-ink3">{error ?? "This report link is invalid."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page px-4 py-10">
      <div className="report-print mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink4">{data.client_name}</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{data.project_name}</h1>
            <span className="mt-2 inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand ring-1 ring-inset ring-brand/30">
              {data.status}
            </span>
          </div>
          <button className="btn-secondary no-print" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </div>

        {data.description && <p className="text-sm leading-relaxed text-ink3">{data.description}</p>}

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Progress</h2>
          <p className="mt-1 text-xs text-ink4">
            {data.completed_task_count} of {data.task_count} tasks complete
          </p>
          <div className="mt-3">
            <ProgressBar value={data.progress} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-ink4">Timeline</p>
              <p className="mt-0.5 font-medium text-ink2">{data.timeline || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-ink4">Budget</p>
              <p className="mt-0.5 font-medium text-ink2">{data.budget || "—"}</p>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          {data.activities.length === 0 ? (
            <p className="mt-2 text-sm text-ink4">No activity recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.activities.map((activity, index) => (
                <li key={index} className="text-sm">
                  <p className="text-ink2">
                    <span className="font-medium">{activity.action}</span>
                    {activity.detail && <span className="text-ink3"> — {activity.detail}</span>}
                  </p>
                  <p className="text-xs text-ink4">{formatDateTime(activity.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-ink4">Generated {formatDateTime(data.generated_at)}</p>
      </div>
    </div>
  );
}
