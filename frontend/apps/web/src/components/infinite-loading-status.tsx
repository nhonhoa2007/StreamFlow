"use client";
import { Loader2 } from "lucide-react";
import type { RefObject } from "react";
export function InfiniteLoadingStatus({
  sentinelRef,
  loading,
  error,
  hasMore,
  hasItems,
  manualFallback,
  loadNext,
}: {
  sentinelRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  hasItems: boolean;
  manualFallback: boolean;
  loadNext: (retry?: boolean) => Promise<void>;
}) {
  return (
    <div className="mt-8 flex min-h-16 flex-col items-center justify-center gap-3 text-center">
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {loading ? (
        <output
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-sf-text-secondary"
        >
          <Loader2 size={17} className="animate-spin" />
          Loading more titles…
        </output>
      ) : error ? (
        <>
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
          <button type="button" className="button-secondary" onClick={() => void loadNext(true)}>
            Retry loading titles
          </button>
        </>
      ) : hasMore && manualFallback ? (
        <button type="button" className="button-secondary" onClick={() => void loadNext()}>
          Load more titles
        </button>
      ) : !hasMore && hasItems ? (
        <output className="text-xs text-sf-text-muted">You’ve reached the end.</output>
      ) : null}
    </div>
  );
}
