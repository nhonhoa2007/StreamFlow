import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { RenditionProfile } from "@streamflow/contracts";

const execFileAsync = promisify(execFile);

export async function generateHlsRendition(
  inputPath: string,
  outputDir: string,
  profile: RenditionProfile,
  segmentDurationSeconds = 4,
): Promise<{ playlistPath: string; segmentCount: number }> {
  fs.mkdirSync(outputDir, { recursive: true });

  const playlistPath = path.join(outputDir, `${profile.name}.m3u8`);
  const segmentPattern = path.join(outputDir, `${profile.name}_%03d.ts`);

  const maxRate = Math.round(profile.videoBitrateKbps * 1.2);
  const bufSize = Math.round(profile.videoBitrateKbps * 2);

  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `scale=w=${profile.width}:h=${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
    "-c:v",
    "libx264",
    "-b:v",
    `${profile.videoBitrateKbps}k`,
    "-maxrate",
    `${maxRate}k`,
    "-bufsize",
    `${bufSize}k`,
    "-preset",
    "fast",
    "-g",
    "48",
    "-keyint_min",
    "48",
    "-sc_threshold",
    "0",
    "-c:a",
    "aac",
    "-b:a",
    `${profile.audioBitrateKbps}k`,
    "-ar",
    "48000",
    "-hls_time",
    String(segmentDurationSeconds),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    segmentPattern,
    playlistPath,
  ];

  await execFileAsync("ffmpeg", args);

  const files = fs.readdirSync(outputDir);
  const segmentFiles = files.filter((f) => f.startsWith(`${profile.name}_`) && f.endsWith(".ts"));

  return {
    playlistPath,
    segmentCount: segmentFiles.length,
  };
}

export async function extractThumbnail(
  inputPath: string,
  outputPath: string,
  timestampSeconds = 3,
): Promise<string> {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  // Format timestamp as HH:MM:SS
  const hours = Math.floor(timestampSeconds / 3600);
  const minutes = Math.floor((timestampSeconds % 3600) / 60);
  const seconds = timestampSeconds % 60;
  const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  const args = ["-y", "-ss", timeStr, "-i", inputPath, "-vframes", "1", "-q:v", "2", outputPath];

  await execFileAsync("ffmpeg", args);
  return outputPath;
}
