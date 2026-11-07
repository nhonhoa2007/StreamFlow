"use client";

import type { MediaItem } from "@streamflow/contracts";
import { ArrowUpRight, Heart, Play } from "lucide-react";
import { MediaArtwork } from "./media-artwork";
import { formatMediaDuration } from "./media-primitives";

export function ClassificationLabels({ labels }: { labels?: readonly string[] }) {
  if (!labels?.length) return null;
  const visibleLabels = labels.slice(0, 3);
  const overflowCount = labels.length - visibleLabels.length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Classifications">
      {visibleLabels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-sf-text-secondary"
        >
          {label}
        </span>
      ))}
      {overflowCount > 0 && (
        <span
          aria-label={`${overflowCount} more classification${overflowCount === 1 ? "" : "s"}`}
          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-sf-text-muted"
        >
          +{overflowCount} more classification{overflowCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

export function MediaCard({
  item,
  variant = "landscape",
  progressPercent,
  isFavorited = false,
  fluid = false,
  onPlay,
  onOpenDetails,
  onToggleFavorite,
}: {
  item: MediaItem;
  variant?: "landscape" | "square";
  progressPercent?: number;
  isFavorited?: boolean;
  fluid?: boolean;
  onPlay?: (item: MediaItem) => void;
  onOpenDetails?: (item: MediaItem) => void;
  onToggleFavorite?: (item: MediaItem) => void;
}) {
  const isSquare = variant === "square";

  return (
    <article
      className={`group min-w-0 ${fluid ? "w-full" : isSquare ? "w-[184px] sm:w-[200px]" : "w-[240px] sm:w-[280px]"}`}
    >
      <div
        className={`relative overflow-hidden rounded-lg border border-white/10 bg-sf-surface ${isSquare ? "aspect-square" : "aspect-video"}`}
      >
        <MediaArtwork
          title={item.title}
          type={item.type}
          variant={isSquare ? "square" : "landscape"}
          className="h-full w-full"
        />
        <button
          type="button"
          aria-label={`Play ${item.title}`}
          onClick={() => onPlay?.(item)}
          className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-300 hover:bg-black/20"
          disabled={!onPlay}
        />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between pointer-events-none opacity-100 transition-all duration-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Play ${item.title}`}
            onClick={() => onPlay?.(item)}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-sf-base  transition-transform  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent"
          >
            <Play size={17} fill="currentColor" className="ml-0.5" />
          </button>
          <div className="flex items-center gap-2">
            {onToggleFavorite && (
              <button
                type="button"
                aria-label={
                  isFavorited ? `Remove ${item.title} from favorites` : `Save ${item.title}`
                }
                onClick={() => onToggleFavorite(item)}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white  transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent"
              >
                <Heart size={16} fill={isFavorited ? "currentColor" : "none"} />
              </button>
            )}
            {onOpenDetails && (
              <button
                type="button"
                aria-label={`Open details for ${item.title}`}
                onClick={() => onOpenDetails(item)}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white  transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent"
              >
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </div>
        {typeof progressPercent === "number" && (
          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
            aria-label={`${progressPercent}% played`}
          >
            <div
              className="h-full bg-sf-accent"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-sf-text-primary transition-colors group-hover:text-sf-text-primary">
            {item.title}
          </h3>
          <p className="mt-1 text-xs text-sf-text-muted">
            {item.type === "AUDIO" ? "Audio" : "Video"} · {formatMediaDuration(item.durationMs)}
          </p>
          <ClassificationLabels labels={item.classificationLabels} />
        </div>
        {onOpenDetails && (
          <button
            type="button"
            aria-label={`Open ${item.title}`}
            onClick={() => onOpenDetails(item)}
            className="flex min-h-11 min-w-11 items-center justify-center shrink-0 text-sf-text-muted transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent"
          >
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
    </article>
  );
}
