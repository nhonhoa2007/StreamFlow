"use client";
import type { MediaItem } from "@streamflow/contracts";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useLibrary } from "../lib/library-context";
import { fetchMedia } from "../lib/media-api";
import { usePlayback } from "../lib/playback-context";
import { useInfiniteMedia } from "../lib/use-infinite-media";
import { ContinueWatching } from "./continue-watching";
import { FeedbackState } from "./feedback-state";
import { HeroBanner } from "./hero-banner";
import { buildHomeSections } from "./home-content";
import { HomeSections } from "./home-sections";
import { InfiniteLoadingStatus } from "./infinite-loading-status";
import { MediaCard } from "./media-card";
export { formatMediaDuration as formatDuration } from "./media-primitives";
export function CatalogView({
  initialItems = [],
  initialNextCursor = null,
  initialHasMore = false,
  error,
  children,
}: {
  initialItems?: MediaItem[];
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
  error?: string;
  children?: ReactNode;
}) {
  const pagination = useInfiniteMedia(
    { items: initialItems, nextCursor: initialNextCursor, hasMore: initialHasMore },
    (cursor, signal) => fetchMedia(undefined, { cursor, limit: 20, signal }),
  );
  const { items } = pagination;
  const router = useRouter();
  const { play } = usePlayback();
  const { savedIds, toggle } = useLibrary();
  const feature = buildHomeSections(initialItems).featured;
  return (
    <div className="page-content animate-fade-in">
      <div className="mb-7 flex items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Discover</h1>
        </div>
        <Link
          href="/search"
          className="hidden items-center gap-2 pb-1 text-xs text-sf-text-secondary hover:text-white sm:flex"
        >
          Explore the collection
          <ArrowUpRight size={15} />
        </Link>
      </div>
      {error ? (
        <FeedbackState
          kind="error"
          title="The collection is taking a moment"
          message="We couldn't reach the catalog. Please try again."
          action={
            <button type="button" className="button-secondary" onClick={() => router.refresh()}>
              Try again
            </button>
          }
        />
      ) : !feature ? (
        <FeedbackState
          kind="empty"
          title="Your next discovery is on its way"
          message="New films and sounds will appear here as they're added."
          action={
            <Link href="/search" className="button-secondary">
              Explore StreamFlow
            </Link>
          }
        />
      ) : (
        <>
          <HeroBanner item={feature} />
          <div className="my-7 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-2">
              <Link href="/search" className="pill" aria-current="page">
                Discover
              </Link>
              <Link href="/search?type=VIDEO" className="pill">
                Films
              </Link>
              <Link href="/search?type=AUDIO" className="pill">
                Audio
              </Link>
            </div>
            <span className="text-[11px] text-sf-text-muted">Films and audio, in one place.</span>
          </div>
        </>
      )}
      <div className="space-y-10">
        <ContinueWatching />
        {children}
        {feature && <HomeSections items={initialItems} />}
      </div>
      {items.length > initialItems.length && (
        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Keep exploring</h2>
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-9"
            aria-busy={pagination.loading}
          >
            {items.slice(initialItems.length).map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                fluid
                isFavorited={savedIds.has(item.id)}
                onToggleFavorite={(item) => void toggle(item.id)}
                onPlay={(item) => void play(item)}
                onOpenDetails={(item) => router.push(`/media/${item.id}`)}
              />
            ))}
          </div>
        </section>
      )}
      {!error && <InfiniteLoadingStatus {...pagination} hasItems={items.length > 0} />}
      <footer className="mt-14 flex items-center justify-between border-t border-white/10 pt-6 text-[10px] text-sf-text-muted">
        <span className="font-bold uppercase tracking-[.18em]">StreamFlow</span>
        <span>Watch. Listen. Repeat.</span>
      </footer>
    </div>
  );
}
