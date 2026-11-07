import fs from "node:fs";
import path from "node:path";
import type { RenditionProfile } from "@streamflow/contracts";
import {
  type DatabaseHandle,
  type MediaAssetInsert,
  findTranscodeJobById,
  mediaTable,
  publishTranscodedMediaAtomic,
  updateTranscodeJobStatus,
} from "@streamflow/database";
import { UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { classifyMedia } from "./classification.js";
import { extractThumbnail, generateHlsRendition } from "./ffmpeg.util.js";
import { buildRenditionLadder, generateMasterPlaylistContent } from "./ladder.util.js";
import {
  type WorkerStorageConfig,
  createStorageContext,
  downloadObjectToFile,
  uploadDirectory,
  uploadFile,
} from "./object-storage.js";
import { probeMedia } from "./probe.util.js";

export interface TranscodePipelineOptions {
  dbHandle: DatabaseHandle;
  jobId: string;
  sourceFilePath: string;
  sourceObjectKey?: string;
  storage?: WorkerStorageConfig;
  workDir: string;
}

export interface TranscodePipelineResult {
  success: boolean;
  renditions?: RenditionProfile[];
  masterPlaylistPath?: string;
  thumbnailPath?: string;
  error?: string;
  isUnrecoverable?: boolean;
}

export async function executeTranscodePipeline(
  options: TranscodePipelineOptions,
): Promise<TranscodePipelineResult> {
  const { dbHandle, jobId, sourceFilePath, workDir } = options;

  const job = await findTranscodeJobById(dbHandle.db, jobId);
  if (!job) {
    throw new Error(`Transcode job not found: ${jobId}`);
  }

  const tmpStagingDir = path.join(workDir, `tmp_${jobId}`);
  const tmpHlsDir = path.join(tmpStagingDir, "hls");
  const tmpThumbDir = path.join(tmpStagingDir, "thumbnails");
  const sourcePath = path.join(tmpStagingDir, "source.bin");

  try {
    fs.mkdirSync(tmpStagingDir, { recursive: true });
    if (options.storage) {
      const storage = createStorageContext(options.storage);
      await downloadObjectToFile(storage, options.sourceObjectKey ?? sourceFilePath, sourcePath);
    }
    const inputPath = options.storage ? sourcePath : sourceFilePath;

    // 1. Probe video - if invalid, throw UnrecoverableError immediately
    let probe: Awaited<ReturnType<typeof probeMedia>>;
    try {
      probe = await probeMedia(inputPath);
    } catch (probeErr: unknown) {
      throw new UnrecoverableError(
        `Invalid or unreadable video media stream: ${(probeErr as Error).message}`,
      );
    }

    if (!probe.width || !probe.height || (probe.durationSeconds ?? 0) <= 0) {
      throw new UnrecoverableError(
        "Invalid or unreadable video media stream: zero duration or dimensions",
      );
    }

    const [media] = await dbHandle.db
      .select({ type: mediaTable.type })
      .from(mediaTable)
      .where(eq(mediaTable.id, job.mediaId))
      .limit(1);
    if (!media) throw new Error(`Media not found: ${job.mediaId}`);
    const classification = classifyMedia(probe, media.type);

    // 2. Build non-upscaling rendition ladder
    const ladder = buildRenditionLadder(probe.width, probe.height, job.mediaId);
    fs.mkdirSync(tmpHlsDir, { recursive: true });
    fs.mkdirSync(tmpThumbDir, { recursive: true });

    // 3. Generate HLS for each rendition into temporary staging directory
    let progress = 20;
    const progressStep = Math.floor(60 / ladder.length);

    for (const profile of ladder) {
      await generateHlsRendition(inputPath, tmpHlsDir, profile);
      progress += progressStep;
      await updateTranscodeJobStatus(dbHandle.db, jobId, "PROCESSING", progress);
    }

    // 4. Generate Master Playlist in staging directory
    const masterPlaylistContent = generateMasterPlaylistContent(ladder);
    const tmpMasterPlaylistPath = path.join(tmpHlsDir, "master.m3u8");
    fs.writeFileSync(tmpMasterPlaylistPath, masterPlaylistContent, "utf-8");

    // 5. Extract poster thumbnail in staging directory
    const tmpThumbnailPath = path.join(tmpThumbDir, "poster.jpg");
    const durationSeconds = probe.durationSeconds ?? 0;
    const thumbTime = durationSeconds > 3 ? 3 : Math.max(0, Math.floor(durationSeconds / 2));
    await extractThumbnail(inputPath, tmpThumbnailPath, thumbTime);

    // 6. Verification: Ensure all outputs exist with non-zero size before promotion
    if (!fs.existsSync(tmpMasterPlaylistPath) || fs.statSync(tmpMasterPlaylistPath).size === 0) {
      throw new Error("Master playlist verification failed: file is missing or empty");
    }

    for (const profile of ladder) {
      const renditionPath = path.join(tmpHlsDir, `${profile.name}.m3u8`);
      if (!fs.existsSync(renditionPath) || fs.statSync(renditionPath).size === 0) {
        throw new Error(`Rendition playlist verification failed: ${profile.name}.m3u8`);
      }
    }

    if (!fs.existsSync(tmpThumbnailPath) || fs.statSync(tmpThumbnailPath).size === 0) {
      throw new Error("Poster thumbnail verification failed: file is missing or empty");
    }

    // 7. Atomic Promotion: Move verified staging outputs to final destination
    const hlsOutputDir = path.join(workDir, "hls");
    const thumbnailOutputDir = path.join(workDir, "thumbnails");
    fs.mkdirSync(hlsOutputDir, { recursive: true });
    fs.mkdirSync(thumbnailOutputDir, { recursive: true });

    fs.cpSync(tmpHlsDir, hlsOutputDir, { recursive: true });
    fs.cpSync(tmpThumbDir, thumbnailOutputDir, { recursive: true });

    // Clean up temporary staging directory
    try {
      fs.rmSync(tmpStagingDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup errors
    }

    const masterPlaylistPath = path.join(hlsOutputDir, "master.m3u8");
    const thumbnailPath = path.join(thumbnailOutputDir, "poster.jpg");

    // 8. Build assets list for atomic publication
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

    if (options.storage) {
      const storage = createStorageContext(options.storage);
      await uploadDirectory(storage, hlsOutputDir, `hls/${job.mediaId}`);
      await uploadFile(storage, thumbnailPath, `thumbnails/${job.mediaId}/poster.jpg`);
    }

    // 9. Atomic DB publication (Marks job COMPLETED & media READY)
    await publishTranscodedMediaAtomic(
      dbHandle.client,
      job.mediaId,
      job.id,
      assets,
      classification,
    );

    return {
      success: true,
      renditions: ladder,
      masterPlaylistPath,
      thumbnailPath,
    };
  } catch (err: unknown) {
    // Clean up temporary staging directory on failure
    try {
      fs.rmSync(tmpStagingDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    const errorMsg = (err as Error).message || "Transcoding pipeline failed";
    await updateTranscodeJobStatus(dbHandle.db, jobId, "FAILED", 0, errorMsg);

    const isUnrecoverable =
      err instanceof UnrecoverableError ||
      (err as { name?: string })?.name === "UnrecoverableError" ||
      errorMsg.toLowerCase().includes("invalid or unreadable") ||
      errorMsg.toLowerCase().includes("moov atom not found");

    return {
      success: false,
      error: errorMsg,
      isUnrecoverable,
    };
  }
}
