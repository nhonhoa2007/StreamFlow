"use client";
import type { PaginatedMediaResponse } from "@streamflow/contracts";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { LoadMediaPage } from "../lib/infinite-media-store";
import { useLibrary } from "../lib/library-context";
import { usePlayback } from "../lib/playback-context";
import { useInfiniteMedia } from "../lib/use-infinite-media";
import { InfiniteLoadingStatus } from "./infinite-loading-status";
import { MediaCard } from "./media-card";
export function InfiniteMediaGrid({
  initial,
  loadPage,
  onCountChange,
  enabled = true,
}: {
  initial: PaginatedMediaResponse;
  loadPage: LoadMediaPage;
  onCountChange?: (count: number) => void;
  enabled?: boolean;
}) {
  const pagination = useInfiniteMedia(initial, loadPage, enabled);
  const { play } = usePlayback();
  const { savedIds, toggle } = useLibrary();
  const router = useRouter();
  useEffect(() => {
    onCountChange?.(pagination.items.length);
  }, [onCountChange, pagination.items.length]);
  return (
    <>
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-9"
        aria-busy={pagination.loading}
      >
        {pagination.items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            fluid
            onPlay={(item) => void play(item)}
            onOpenDetails={(item) => router.push(`/media/${item.id}`)}
            onToggleFavorite={(item) => void toggle(item.id)}
            isFavorited={savedIds.has(item.id)}
          />
        ))}
      </div>
      <InfiniteLoadingStatus {...pagination} hasItems={pagination.items.length > 0} />
    </>
  );
}
