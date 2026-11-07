import type { MediaItem } from "@streamflow/contracts";
export function buildHomeSections(items: MediaItem[]) {
  return {
    featured: items.find((item) => item.type === "VIDEO") ?? items[0],
    videos: items.filter((item) => item.type === "VIDEO"),
    audio: items.filter((item) => item.type === "AUDIO"),
    recent: items.slice(0, 8),
  };
}
