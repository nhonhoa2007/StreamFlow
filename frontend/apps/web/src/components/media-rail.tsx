import type { MediaItem } from "@streamflow/contracts";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeedbackState } from "./feedback-state";

export function MediaRail({
  title,
  eyebrow,
  items,
  renderItem,
  viewAllHref,
  emptyMessage = "Nothing here yet.",
}: {
  title: string;
  eyebrow?: string;
  items: MediaItem[];
  renderItem: (item: MediaItem) => ReactNode;
  viewAllHref?: string;
  emptyMessage?: string;
}) {
  return (
    <section
      className="space-y-4"
      aria-labelledby={`${title.toLowerCase().replace(/\s+/g, "-")}-heading`}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-sf-accent">
              {eyebrow}
            </p>
          )}
          <h2
            id={`${title.toLowerCase().replace(/\s+/g, "-")}-heading`}
            className="text-xl font-semibold tracking-tight text-sf-text-primary sm:text-2xl"
          >
            {title}
          </h2>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="hidden items-center gap-1 text-xs font-semibold text-sf-text-muted transition-colors hover:text-white sm:flex"
          >
            View all <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {items.length > 0 ? (
        <div className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
          {items.map((item) => (
            <div key={item.id} className="snap-start">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : (
        <FeedbackState
          kind="empty"
          title={emptyMessage}
          message="Check back soon for something new."
        />
      )}
    </section>
  );
}
