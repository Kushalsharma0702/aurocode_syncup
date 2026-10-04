export default function MsmeBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[10px] text-ink4 ${className}`}
      title="Registered under the Udyam Registration scheme, Ministry of MSME, Government of India"
    >
      <svg className="h-3 w-3 shrink-0 text-brand" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      <span>Udyam Registered MSME · UDYAM-UP-28-0196515</span>
    </div>
  );
}
