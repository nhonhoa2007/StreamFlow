import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function FeedbackState({
  kind,
  title,
  message,
  action,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const Icon = kind === "loading" ? Loader2 : kind === "error" ? AlertCircle : Inbox;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-sf-surface/60 px-6 py-8 text-center"
    >
      <Icon
        size={20}
        className={`mb-3 text-sf-text-muted ${kind === "loading" ? "animate-spin" : ""}`}
      />
      <h3 className="text-sm font-semibold text-sf-text-primary">{title}</h3>
      {message && <p className="mt-1 max-w-md text-xs leading-5 text-sf-text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
