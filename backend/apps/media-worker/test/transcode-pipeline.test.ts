import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  type DatabaseHandle,
  createDatabase,
  mediaAssetsTable,
  mediaTable,
  runMigrations,
  transcodeJobsTable,
} from "@streamflow/database";
import { type TestDatabaseInstance, startTestDatabase } from "@streamflow/database/test-helper";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeTranscodePipeline } from "../src/transcode-pipeline.js";

const execFileAsync = promisify(execFile);

describe("Transcoding Pipeline Integration Tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;
  let tmpDir: string;
  let validVideoPath: string;
  let corruptedVideoPath: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    dbHandle = createDatabase(testDb.databaseUrl);

    tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "sf_transcode_test_"));

    // Generate a valid 3-second 720p synthetic video
    validVideoPath = path.join(tmpDir, "valid_720p.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=3:size=1280x720:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=3",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
      validVideoPath,
    ]);

    // Create a corrupted fake video file
    corruptedVideoPath = path.join(tmpDir, "corrupted.mp4");
    fs.writeFileSync(corruptedVideoPath, "This is not a real video file content at all!");
  }, 25000);

  afterAll(async () => {
    if (dbHandle) {
      await dbHandle.close();
    }
    if (testDb) {
      await testDb.cleanup();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("transcodes valid video, generates HLS & thumbnail, and atomically publishes READY", async () => {
    // 1. Setup media and source asset in DB
    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Test Stream Film",
        slug: "test-stream-film",
        status: "DRAFT",
      })
      .returning();

    const [sourceAsset] = await dbHandle.db
      .insert(mediaAssetsTable)
      .values({
        mediaId: media.id,
        kind: "SOURCE_VIDEO",
        objectKey: "raw/test-media/valid.mp4",
        sizeBytes: 1048576n,
        mimeType: "video/mp4",
      })
      .returning();

    const [job] = await dbHandle.db
      .insert(transcodeJobsTable)
      .values({
        mediaId: media.id,
        sourceAssetId: sourceAsset.id,
        profileVersion: 1,
        status: "QUEUED",
      })
      .returning();

    const outputWorkDir = path.join(tmpDir, `out_${media.id}`);

    // 2. Execute pipeline
    const result = await executeTranscodePipeline({
      dbHandle,
      jobId: job.id,
      sourceFilePath: validVideoPath,
      workDir: outputWorkDir,
    });

    expect(result.success).toBe(true);
    expect(result.renditions).toHaveLength(2); // 720p and 360p (NO 1080p upscaling!)
    expect(result.masterPlaylistPath).toBeDefined();
    expect(result.thumbnailPath).toBeDefined();

    // 3. Verify files on disk
    expect(fs.existsSync(result.masterPlaylistPath)).toBe(true);
    expect(fs.existsSync(result.thumbnailPath)).toBe(true);

    const masterContent = fs.readFileSync(result.masterPlaylistPath, "utf-8");
    expect(masterContent).toContain("720p.m3u8");
    expect(masterContent).toContain("360p.m3u8");

    // 4. Verify DB state atomic update
    const [updatedJob] = await dbHandle.client`
      SELECT * FROM transcode_jobs WHERE id = ${job.id}::uuid
    `;
    expect(updatedJob.status).toBe("COMPLETED");
    expect(updatedJob.progress_percent).toBe(100);

    const [updatedMedia] = await dbHandle.client`
      SELECT * FROM media WHERE id = ${media.id}::uuid
    `;
    expect(updatedMedia.status).toBe("READY");
    expect(updatedMedia.published_at).not.toBeNull();
    expect(updatedMedia.metadata).toMatchObject({
      version: 1,
      container: "mov",
      durationSeconds: expect.any(Number),
      width: 1280,
      height: 720,
      videoCodec: "h264",
      audioCodec: "aac",
      tags: {},
    });
    expect(updatedMedia.classification_labels).toContain("video-hd");

    // 5. Verify registered media_assets
    const assets = await dbHandle.client`
      SELECT kind, object_key FROM media_assets WHERE media_id = ${media.id}::uuid
    `;
    expect(assets.some((a: { kind: string }) => a.kind === "HLS_PLAYLIST")).toBe(true);
    expect(assets.some((a: { kind: string }) => a.kind === "THUMBNAIL")).toBe(true);
  }, 25000);

  it("fails gracefully on corrupted source file, marks FAILED, and leaves media DRAFT", async () => {
    // 1. Setup media and source asset in DB
    const [media] = await dbHandle.db
      .insert(mediaTable)
      .values({
        type: "VIDEO",
        title: "Corrupted Film",
        slug: "corrupted-film",
        status: "DRAFT",
      })
      .returning();

    const [sourceAsset] = await dbHandle.db
      .insert(mediaAssetsTable)
      .values({
        mediaId: media.id,
        kind: "SOURCE_VIDEO",
        objectKey: "raw/test-media/corrupted.mp4",
        sizeBytes: 50n,
        mimeType: "video/mp4",
      })
      .returning();

    const [job] = await dbHandle.db
      .insert(transcodeJobsTable)
      .values({
        mediaId: media.id,
        sourceAssetId: sourceAsset.id,
        profileVersion: 1,
        status: "QUEUED",
      })
      .returning();

    const outputWorkDir = path.join(tmpDir, `out_bad_${media.id}`);

    // 2. Execute pipeline
    const result = await executeTranscodePipeline({
      dbHandle,
      jobId: job.id,
      sourceFilePath: corruptedVideoPath,
      workDir: outputWorkDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // 3. Verify DB state: job is FAILED, media is still DRAFT (not published!)
    const [updatedJob] = await dbHandle.client`
      SELECT * FROM transcode_jobs WHERE id = ${job.id}::uuid
    `;
    expect(updatedJob.status).toBe("FAILED");
    expect(updatedJob.error_message).toBeDefined();

    const [updatedMedia] = await dbHandle.client`
      SELECT * FROM media WHERE id = ${media.id}::uuid
    `;
    expect(updatedMedia.status).toBe("DRAFT");
    expect(updatedMedia.published_at).toBeNull();
    expect(updatedMedia.metadata).toBeNull();
    expect(updatedMedia.classification_labels).toEqual([]);
  });
});
