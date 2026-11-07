import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MediaMetadata, MetadataClassificationJobPayload } from "@streamflow/contracts";
import { type DatabaseHandle, mediaTable, updateMediaClassification } from "@streamflow/database";
import { eq } from "drizzle-orm";
import { classifyMedia } from "./classification.js";
import {
  type WorkerStorageConfig,
  createStorageContext,
  downloadObjectToFile,
} from "./object-storage.js";
import { type ProbeResult, probeMedia } from "./probe.util.js";

export interface MetadataClassificationJobOptions
  extends Omit<MetadataClassificationJobPayload, "jobType"> {
  dbHandle: DatabaseHandle;
  storage?: WorkerStorageConfig;
  workDir?: string;
  downloader?: (objectKey: string, destinationPath: string) => Promise<void>;
  prober?: (filePath: string) => Promise<ProbeResult>;
  classifier?: (
    probe: ProbeResult,
    mediaType: "AUDIO" | "VIDEO",
  ) => {
    metadata: MediaMetadata;
    labels: string[];
  };
  persister?: (
    dbHandle: DatabaseHandle,
    mediaId: string,
    metadata: MediaMetadata,
    labels: string[],
  ) => Promise<void>;
}

export async function runMetadataClassificationJob(
  options: MetadataClassificationJobOptions,
): Promise<{ labels: string[] }> {
  const {
    dbHandle,
    mediaId,
    sourceObjectKey,
    storage,
    workDir = path.join(os.tmpdir(), "streamflow-worker"),
    downloader,
    prober = probeMedia,
    classifier = classifyMedia,
    persister = async (handle, id, metadata, labels) => {
      await updateMediaClassification(handle.db, id, metadata, labels as never);
    },
  } = options;

  const [media] = await dbHandle.db
    .select({ type: mediaTable.type })
    .from(mediaTable)
    .where(eq(mediaTable.id, mediaId))
    .limit(1);
  if (!media) throw new Error(`Media not found: ${mediaId}`);

  await fs.mkdir(workDir, { recursive: true });
  const directory = await fs.mkdtemp(path.join(workDir, "metadata-"));
  const sourcePath = path.join(directory, "source");
  try {
    const download =
      downloader ??
      (async (objectKey: string, destinationPath: string) => {
        await downloadObjectToFile(createStorageContext(storage ?? {}), objectKey, destinationPath);
      });
    await download(sourceObjectKey, sourcePath);
    const probe = await prober(sourcePath);
    const result = classifier(probe, media.type);
    await persister(dbHandle, mediaId, result.metadata, result.labels);
    return { labels: result.labels };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
