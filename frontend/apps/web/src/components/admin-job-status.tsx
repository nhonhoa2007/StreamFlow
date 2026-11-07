"use client";
import type { TranscodeJobStatusResponse } from "@streamflow/contracts";
import { Loader2, RotateCcw } from "lucide-react";

const labels: Record<TranscodeJobStatusResponse["status"], string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};
export function AdminJobStatus({
  job,
  onRetry,
  retrying = false,
}: { job?: TranscodeJobStatusResponse; onRetry?: () => void; retrying?: boolean }) {
  if (!job) return <span className="text-xs text-sf-text-muted">No transcode job</span>;
  const active = job.status === "QUEUED" || job.status === "PROCESSING";
  return (
    <div className="flex items-center gap-3 text-xs" aria-label={`Transcode ${labels[job.status]}`}>
      <span
        className={
          active ? "text-sf-accent" : job.status === "FAILED" ? "text-rose-300" : "text-emerald-300"
        }
      >
        {labels[job.status]}
        {active ? ` · ${job.progressPercent}%` : ""}
      </span>
      {job.status === "FAILED" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1 text-sf-text-secondary hover:text-white"
          aria-label="Retry transcode"
        >
          <RotateCcw size={13} className={retrying ? "animate-spin" : ""} /> Retry
        </button>
      )}
      {retrying && <Loader2 size={13} className="animate-spin" />}
      {job.errorMessage && (
        <span className="max-w-48 truncate text-rose-200" title={job.errorMessage}>
          {job.errorMessage}
        </span>
      )}
    </div>
  );
}
