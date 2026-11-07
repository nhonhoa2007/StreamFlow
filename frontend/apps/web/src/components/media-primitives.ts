import type { MediaType } from "@streamflow/contracts";

export interface ArtworkTheme {
  from: string;
  to: string;
  accent: string;
}

const VIDEO_THEMES: ArtworkTheme[] = [
  { from: "#151515", to: "#303030", accent: "#d9202e" },
  { from: "#1a1a1a", to: "#383838", accent: "#d9202e" },
];
const AUDIO_THEMES: ArtworkTheme[] = [
  { from: "#1d1d1d", to: "#444444", accent: "#d9202e" },
  { from: "#222222", to: "#505050", accent: "#d9202e" },
];

function hashTitle(title: string): number {
  return [...title].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);
}

export function getArtworkTheme(title: string, type: MediaType): ArtworkTheme {
  const themes = type === "AUDIO" ? AUDIO_THEMES : VIDEO_THEMES;
  return themes[hashTitle(title) % themes.length];
}

export function formatMediaDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return "Unknown duration";
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function getMediaInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || "SF"
  ).toUpperCase();
}
