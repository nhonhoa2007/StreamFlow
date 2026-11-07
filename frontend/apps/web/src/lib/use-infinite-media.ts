"use client";
import type { PaginatedMediaResponse } from "@streamflow/contracts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { InfiniteMediaStore, type LoadMediaPage } from "./infinite-media-store";

export function useInfiniteMedia(
  initial: PaginatedMediaResponse,
  loadPage: LoadMediaPage,
  enabled = true,
) {
  const [store] = useState(() => new InfiniteMediaStore(initial, loadPage));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [manualFallback, setManualFallback] = useState(false);
  useEffect(() => {
    store.activate();
    return store.dispose;
  }, [store]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setManualFallback(true);
      return;
    }
    const target = sentinelRef.current;
    if (!enabled || !target || !snapshot.hasMore || snapshot.loading || snapshot.error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (store.getSnapshot().nextCursor !== snapshot.nextCursor) return;
        if (entries.some((entry) => entry.isIntersecting)) void store.loadNext();
      },
      { rootMargin: "400px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, snapshot.hasMore, snapshot.loading, snapshot.error, snapshot.nextCursor, store]);
  return { ...snapshot, sentinelRef, manualFallback, loadNext: store.loadNext };
}
