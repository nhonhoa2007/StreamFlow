"use client";
import type { MediaItem } from "@streamflow/contracts";
import { ArrowUpRight, Check, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useLibrary } from "../lib/library-context";
import { usePlayback } from "../lib/playback-context";
import { MediaArtwork } from "./media-artwork";
import { formatMediaDuration } from "./media-primitives";
export function HeroBanner({ item }: { item: MediaItem }) {
  const { play } = usePlayback();
  const { toggle, savedIds, pendingIds } = useLibrary();
  const saved = savedIds.has(item.id);
  return (
    <section className="hero-feature" aria-label="Featured title">
      <MediaArtwork title={item.title} type={item.type} variant="hero" className="hero-art" />
      <div className="hero-copy">
        <div className="mb-6 flex items-center gap-3">
          <span className="h-px w-6 bg-sf-accent" />
          <span className="text-[10px] font-bold uppercase tracking-[.25em] text-sf-text-primary">
            Featured
          </span>
        </div>
        <h2>{item.title}</h2>
        <div className="my-5 flex items-center gap-3 text-xs text-sf-text-secondary">
          <span className="rounded border border-white/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">
            {item.type === "AUDIO" ? "Audio" : "Film"}
          </span>
          <span>{formatMediaDuration(item.durationMs)}</span>
          <span className="h-1 w-1 rounded-full bg-sf-text-muted" />
          <span>Selected for you</span>
        </div>
        <p className="mb-7 max-w-sm text-sm leading-6 text-sf-text-secondary">
          {item.type === "AUDIO"
            ? "Turn down the noise. Find a sound that stays with you."
            : "A different point of view. Take a moment, settle in, and discover something worth your time."}
        </p>
        <div className="hero-actions flex flex-wrap items-center gap-3">
          <button type="button" className="button-primary" onClick={() => void play(item)}>
            <Play size={16} fill="currentColor" />
            {item.type === "AUDIO" ? "Listen now" : "Watch now"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void toggle(item.id)}
            disabled={pendingIds.has(item.id)}
            aria-pressed={saved}
          >
            {saved ? <Check size={17} /> : <Plus size={17} />}
            {saved ? "In your library" : "My list"}
          </button>
          <Link
            href={`/media/${item.id}`}
            className="icon-button"
            aria-label="View featured title details"
          >
            <ArrowUpRight size={21} />
          </Link>
        </div>
      </div>
    </section>
  );
}
