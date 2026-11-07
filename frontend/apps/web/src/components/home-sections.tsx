"use client";
import type { MediaItem } from "@streamflow/contracts";
import { useRouter } from "next/navigation";
import { useLibrary } from "../lib/library-context";
import { usePlayback } from "../lib/playback-context";
import { buildHomeSections } from "./home-content";
import { MediaCard } from "./media-card";
import { MediaRail } from "./media-rail";
export function HomeSections({ items }: { items: MediaItem[] }) {
  const { videos, audio, recent } = buildHomeSections(items);
  const { play } = usePlayback();
  const { toggle, savedIds } = useLibrary();
  const router = useRouter();
  const render = (item: MediaItem) => (
    <MediaCard
      item={item}
      variant={item.type === "AUDIO" ? "square" : "landscape"}
      onPlay={(item) => void play(item)}
      onOpenDetails={(item) => router.push(`/media/${item.id}`)}
      onToggleFavorite={(item) => void toggle(item.id)}
      isFavorited={savedIds.has(item.id)}
    />
  );
  return (
    <div className="space-y-10">
      <MediaRail
        title="Films"
        items={videos}
        renderItem={render}
        viewAllHref="/search?type=VIDEO"
        emptyMessage="New films are on their way"
      />
      <MediaRail
        title="Audio"
        items={audio}
        renderItem={render}
        viewAllHref="/search?type=AUDIO"
        emptyMessage="Your next listen is on its way"
      />
      <MediaRail title="Recently added" items={recent} renderItem={render} viewAllHref="/search" />
    </div>
  );
}
