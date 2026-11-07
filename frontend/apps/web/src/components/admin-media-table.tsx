"use client";
import type { AdminMediaRecord, TranscodeJobStatusResponse } from "@streamflow/contracts";
import { Pencil, Trash2, WandSparkles } from "lucide-react";
import { AdminJobStatus } from "./admin-job-status";
export function AdminMediaTable({
  items,
  jobs,
  filter,
  onFilter,
  onEdit,
  onDelete,
  onTranscode,
  retryingId,
}: {
  items: AdminMediaRecord[];
  jobs: Record<string, TranscodeJobStatusResponse | undefined>;
  filter: string;
  onFilter: (value: string) => void;
  onEdit: (item: AdminMediaRecord) => void;
  onDelete: (item: AdminMediaRecord) => void;
  onTranscode: (item: AdminMediaRecord) => void;
  retryingId?: string;
}) {
  const shown = items.filter(
    (item) =>
      filter === "all" ||
      (filter === "processing"
        ? ["QUEUED", "PROCESSING"].includes(jobs[item.id]?.status ?? "")
        : filter === "failed"
          ? jobs[item.id]?.status === "FAILED"
          : item.status === filter.toUpperCase()),
  );
  return (
    <div className="rounded-lg border border-white/10 bg-sf-surface p-5">
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {["all", "draft", "ready", "processing", "failed"].map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => onFilter(value)}
            className={filter === value ? "pill bg-white/15" : "pill"}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-sf-text-muted">No titles in this view.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 border-t border-white/10 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-sf-text-muted">
                  {item.type} · {item.status} · {item.slug}
                </p>
              </div>
              <AdminJobStatus
                job={jobs[item.id]}
                onRetry={() => onTranscode(item)}
                retrying={retryingId === item.id}
              />
              <button
                type="button"
                onClick={() => onTranscode(item)}
                className="p-2 text-sf-text-secondary"
                aria-label={`Transcode ${item.title}`}
              >
                <WandSparkles size={15} />
              </button>
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="p-2 text-sf-text-secondary"
                aria-label={`Edit ${item.title}`}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(item)}
                className="p-2 text-rose-300"
                aria-label={`Delete ${item.title}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
