import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runTranscodeExperiment() {
  console.log("=== StreamFlow M05 Media Transcoding & ABR Experiment ===");

  const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "sf_m05_exp_"));
  const sampleVideo = path.join(tmpDir, "source_720p.mp4");

  try {
    // 1. Generate 5-second test video
    console.log("[1/3] Generating 5-second 1280x720 24fps test video...");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=5:size=1280x720:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=5",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
      sampleVideo,
    ]);

    // 2. Measure Transcoding Duration on 360p
    console.log("[2/3] Transcoding Rendition 360p (640x360 @ 800 kbps)...");
    const dir360p = path.join(tmpDir, "hls_360p");
    fs.mkdirSync(dir360p, { recursive: true });

    const start360 = performance.now();
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      sampleVideo,
      "-vf",
      "scale=640:360",
      "-c:v",
      "libx264",
      "-b:v",
      "800k",
      "-preset",
      "fast",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      path.join(dir360p, "360p.m3u8"),
    ]);
    const duration360Ms = Math.round(performance.now() - start360);

    // 3. Measure Transcoding Duration on 720p
    console.log("[3/3] Transcoding Rendition 720p (1280x720 @ 2200 kbps)...");
    const dir720p = path.join(tmpDir, "hls_720p");
    fs.mkdirSync(dir720p, { recursive: true });

    const start720 = performance.now();
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      sampleVideo,
      "-vf",
      "scale=1280:720",
      "-c:v",
      "libx264",
      "-b:v",
      "2200k",
      "-preset",
      "fast",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      path.join(dir720p, "720p.m3u8"),
    ]);
    const duration720Ms = Math.round(performance.now() - start720);

    const size360Bytes = fs.statSync(path.join(dir360p, "360p0.ts")).size;
    const size720Bytes = fs.statSync(path.join(dir720p, "720p0.ts")).size;

    console.log("\n=== Rendition Benchmark Comparison ===");
    console.table([
      {
        Rendition: "360p (SD)",
        Resolution: "640x360",
        "Target Bitrate": "800 kbps",
        "Duration (ms)": duration360Ms,
        "Segment 0 Size": `${Math.round(size360Bytes / 1024)} KB`,
        "Bandwidth Saving vs 720p": `${Math.round((1 - size360Bytes / size720Bytes) * 100)}%`,
      },
      {
        Rendition: "720p (HD)",
        Resolution: "1280x720",
        "Target Bitrate": "2200 kbps",
        "Duration (ms)": duration720Ms,
        "Segment 0 Size": `${Math.round(size720Bytes / 1024)} KB`,
        "Bandwidth Saving vs 720p": "Baseline",
      },
    ]);

    return { duration360Ms, duration720Ms };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runTranscodeExperiment().catch((err) => {
    console.error("Experiment failed:", err);
    process.exit(1);
  });
}
