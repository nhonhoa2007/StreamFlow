import { type MediaMetadata, MediaMetadataSchema, type MediaType } from "@streamflow/contracts";
import type { ProbeResult } from "./probe.util.js";
function genres(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[;,/]/)
        .map((v) =>
          v
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 64),
        )
        .filter(Boolean),
    ),
  ].sort();
}
export function classifyMedia(
  probe: ProbeResult,
  mediaType: MediaType,
): { metadata: MediaMetadata; labels: string[] } {
  const candidate: Record<string, unknown> = { version: 1, tags: {} };
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(probe.tags ?? {})) {
    if (typeof v === "string" && v.trim()) tags[k] = v.trim().slice(0, 64);
  }
  candidate.tags = tags;
  for (const key of [
    "container",
    "durationSeconds",
    "sizeBytes",
    "bitrateKbps",
    "width",
    "height",
    "videoCodec",
    "audioCodec",
    "sampleRateHz",
    "channels",
  ] as const) {
    const value = probe[key];
    const numeric =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (key === "width" ||
      key === "height" ||
      key === "sampleRateHz" ||
      key === "channels" ||
      key === "sizeBytes"
        ? Number.isInteger(value) && value > 0
        : value >= 0);
    if (
      value !== undefined &&
      (numeric ||
        (typeof value === "string" &&
          value.trim().length > 0 &&
          value.trim().length <= 64 &&
          ["container", "videoCodec", "audioCodec"].includes(key)))
    )
      candidate[key] = value;
  }
  const metadata = MediaMetadataSchema.parse(candidate);
  const labels: string[] = [];
  if (mediaType === "VIDEO" && probe.hasVideo && !probe.dimensionsInvalid) {
    const dimension =
      probe.width !== undefined && probe.height !== undefined
        ? Math.max(probe.width, probe.height)
        : undefined;
    labels.push(
      dimension === undefined
        ? "video-sd"
        : dimension >= 2160
          ? "video-4k"
          : dimension >= 720
            ? "video-hd"
            : "video-sd",
    );
  }
  if (
    mediaType === "AUDIO" &&
    probe.hasAudio &&
    typeof probe.audioCodec === "string" &&
    probe.audioCodec.trim()
  ) {
    const codec = probe.audioCodec.toLowerCase();
    labels.push(
      ["flac", "alac"].includes(codec) || codec.startsWith("pcm_")
        ? "audio-lossless"
        : "audio-lossy",
    );
  }
  labels.push(...genres(typeof probe.tags?.genre === "string" ? probe.tags.genre : undefined));
  return { metadata, labels };
}
