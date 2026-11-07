import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export interface ProbeResult {
  hasVideo: boolean;
  hasAudio: boolean;
  dimensionsInvalid?: boolean;
  width?: number;
  height?: number;
  durationSeconds?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrateKbps?: number;
  container?: string;
  sizeBytes?: number;
  sampleRateHz?: number;
  channels?: number;
  tags: Record<string, string>;
}
const num = (v: unknown, int = false) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n >= 0 && (!int || Number.isInteger(n)) ? n : undefined;
};
const pos = (v: unknown) => {
  const n = num(v, true);
  return n && n > 0 ? n : undefined;
};
const text = (v: unknown, max = 64) =>
  typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : undefined;
const TAG_KEYS = new Set([
  "title",
  "artist",
  "album",
  "album_artist",
  "genre",
  "date",
  "track",
  "disc",
  "comment",
  "language",
]);
export function parseProbeOutput(data: unknown): ProbeResult {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const format =
    root.format && typeof root.format === "object" ? (root.format as Record<string, unknown>) : {};
  const streams = Array.isArray(root.streams)
    ? root.streams.filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    : [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const tags: Record<string, string> = {};
  const copy = (src: unknown) => {
    if (!src || typeof src !== "object") return;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      const val = text(v);
      if (TAG_KEYS.has(key) && val) tags[key] = val;
    }
  };
  copy(format.tags);
  copy(video?.tags);
  copy(audio?.tags);
  const br = num(format.bit_rate) ?? num(video?.bit_rate) ?? num(audio?.bit_rate);
  return {
    hasVideo: !!video,
    hasAudio: !!audio,
    dimensionsInvalid:
      !!video &&
      ((video.width !== undefined && pos(video.width) === undefined) ||
        (video.height !== undefined && pos(video.height) === undefined)),
    width: pos(video?.width),
    height: pos(video?.height),
    durationSeconds: num(format.duration),
    sizeBytes: num(format.size, true),
    videoCodec: text(video?.codec_name),
    audioCodec: text(audio?.codec_name),
    bitrateKbps: br === undefined ? undefined : Math.round(br / 1000),
    container: text(format.format_name)?.split(",")[0],
    sampleRateHz: pos(audio?.sample_rate),
    channels: pos(audio?.channels),
    tags,
  };
}
export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height,codec_name,codec_type,bit_rate,sample_rate,channels:stream_tags",
    "-show_entries",
    "format=format_name,duration,size,bit_rate:format_tags",
    "-of",
    "json",
    filePath,
  ];
  const { stdout } = await execFileAsync("ffprobe", args);
  return parseProbeOutput(JSON.parse(stdout));
}
