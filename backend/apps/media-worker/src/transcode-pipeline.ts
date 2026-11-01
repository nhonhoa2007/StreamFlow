import fs from "node:fs";
import path from "node:path";
import type { RenditionProfile } from "@streamflow/contracts";
import {
  type DatabaseHandle,
  type MediaAssetInsert,
  findTranscodeJobById,
  publishTranscodedMediaAtomic,
  updateTranscodeJobStatus,
} from "@streamflow/database";
import { extractThumbnail, generateHlsRendition } from "./ffmpeg.util.js";
import { buildRenditionLadder, generateMasterPlaylistContent } from "./ladder.util.js";
import { probeMedia } from "./probe.util.js";

export interface TranscodePipelineOptions {
  dbHandle: DatabaseHandle;
  jobId: string;
  sourceFilePath: string;
  workDir: string;
}

export interface TranscodePipelineResult {
  success: boolean;
  renditions?: RenditionProfile[];
  masterPlaylistPath?: string;
  thumbnailPath?: string;
  error?: string;
}

export async function executeTranscodePipeline(
  options: TranscodePipelineOptions,
): Promise<TranscodePipelineResult> {
  const { dbHandle, jobId, sourceFilePath, workDir } = options;

  const job = await findTranscodeJobById(dbHandle.db, jobId);
  if (!job) {
    throw new Error(`Transcode job not found: ${jobId}`);
  }

  // Update status to PROCESSING
  await updateTranscodeJobStatus(dbHandle.db, jobId, "PROCESSING", 10);

  try {
    // 1. Probe video
    const probe = await probeMedia(sourceFilePath);
    if (!probe.width || !probe.height || probe.durationSeconds <= 0) {
      throw new Error("Invalid or unreadable video media stream");
    }

    // 2. Build non-upscaling rendition ladder
    const ladder = buildRenditionLadder(probe.width, probe.height, job.mediaId);
    const hlsOutputDir = path.join(workDir, "hls");
    fs.mkdirSync(hlsOutputDir, { recursive: true });

    // 3. Generate HLS for each rendition
    let progress = 20;
    const progressStep = Math.floor(60 / ladder.length);

    for (const profile of ladder) {
      await generateHlsRendition(sourceFilePath, hlsOutputDir, profile);
      progress += progressStep;
      await updateTranscodeJobStatus(dbHandle.db, jobId, "PROCESSING", progress);
    }

    // 4. Generate Master Playlist
    const masterPlaylistContent = generateMasterPlaylistContent(ladder);
    const masterPlaylistPath = path.join(hlsOutputDir, "master.m3u8");
    fs.writeFileSync(masterPlaylistPath, masterPlaylistContent, "utf-8");

    // 5. Extract poster thumbnail (at 3s or midpoint if duration <= 3s)
    const thumbnailOutputDir = path.join(workDir, "thumbnails");
    fs.mkdirSync(thumbnailOutputDir, { recursive: true });
    const thumbnailPath = path.join(thumbnailOutputDir, "poster.jpg");
    const thumbTime =
      probe.durationSeconds > 3 ? 3 : Math.max(0, Math.floor(probe.durationSeconds / 2));
    await extractThumbnail(sourceFilePath, thumbnailPath, thumbTime);

    // 6. Build assets list for atomic publication
    const assets: MediaAssetInsert[] = [
      {
        mediaId: job.mediaId,
        kind: "HLS_PLAYLIST",
        objectKey: `hls/${job.mediaId}/master.m3u8`,
        sizeBytes: BigInt(fs.statSync(masterPlaylistPath).size),
        mimeType: "application/vnd.apple.mpegurl",
      },
      ...ladder.map((p) => ({
        mediaId: job.mediaId,
        kind: "HLS_PLAYLIST" as const,
        objectKey: p.playlistKey,
        sizeBytes: BigInt(fs.statSync(path.join(hlsOutputDir, `${p.name}.m3u8`)).size),
        mimeType: "application/vnd.apple.mpegurl",
      })),
      {
        mediaId: job.mediaId,
        kind: "THUMBNAIL",
        objectKey: `thumbnails/${job.mediaId}/poster.jpg`,
        sizeBytes: BigInt(fs.statSync(thumbnailPath).size),
        mimeType: "image/jpeg",
      },
    ];

    // 7. Atomic DB publication (Marks job COMPLETED & media READY)
    await publishTranscodedMediaAtomic(dbHandle.client, job.mediaId, job.id, assets);

    return {
      success: true,
      renditions: ladder,
      masterPlaylistPath,
      thumbnailPath,
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || "Transcoding pipeline failed";
    // Mark job FAILED, media stays DRAFT
    await updateTranscodeJobStatus(dbHandle.db, jobId, "FAILED", 0, errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
