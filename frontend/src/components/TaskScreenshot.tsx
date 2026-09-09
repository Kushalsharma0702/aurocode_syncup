import { useEffect, useState } from "react";
import { getToken } from "../lib/api";

export default function TaskScreenshot({ taskId }: { taskId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(`/api/tasks/${taskId}/screenshot`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [taskId]);

  if (!url) return null;

  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} className="mt-2 block">
        <img
          src={url}
          alt="Reporter screenshot"
          className="h-16 w-auto rounded-md border border-line object-cover hover:opacity-80"
        />
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setExpanded(false)}
        >
          <img src={url} alt="Reporter screenshot" className="max-h-full max-w-full rounded-lg shadow-xl" />
        </div>
      )}
    </>
  );
}
