import type { TranscodeJobPayload } from "@streamflow/contracts";
import { type DatabaseHandle, transcodeJobsTable } from "@streamflow/database";
import { type Job, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import {
  type TranscodePipelineOptions,
  type TranscodePipelineResult,
  executeTranscodePipeline,
} from "./transcode-pipeline.js";

export interface TranscodeWorkerOptions {
  redisUrl: string;
  queueName?: string;
  concurrency?: number;
  dbHandle: DatabaseHandle;
  workDir?: string;
  pipelineRunner?: (options: TranscodePipelineOptions) => Promise<TranscodePipelineResult>;
}

export interface TranscodeWorkerHandle {
  worker: Worker<TranscodeJobPayload>;
  close: () => Promise<void>;
}

export function createTranscodeWorker(options: TranscodeWorkerOptions): TranscodeWorkerHandle {
  const {
    redisUrl,
    queueName = "media-transcode-queue",
    concurrency = 2,
    dbHandle,
    workDir = "/tmp/streamflow-worker",
    pipelineRunner = executeTranscodePipeline,
  } = options;

  const parsedRedisUrl = new URL(redisUrl);

  const worker = new Worker<TranscodeJobPayload>(
    queueName,
    async (job: Job<TranscodeJobPayload>) => {
      const { mediaId, sourceAssetId, profileVersion, sourceObjectKey } = job.data;
      const db = dbHandle.db;

      // 1. Check if job record exists in DB
      const [jobRecord] = await db
        .select()
        .from(transcodeJobsTable)
        .where(
          and(
            eq(transcodeJobsTable.mediaId, mediaId),
            eq(transcodeJobsTable.sourceAssetId, sourceAssetId),
            eq(transcodeJobsTable.profileVersion, profileVersion),
          ),
        )
        .limit(1);

      if (!jobRecord) {
        throw new Error(`Transcode job not found in DB for media: ${mediaId}`);
      }

      // Idempotency check: if already COMPLETED, skip
      if (jobRecord.status === "COMPLETED") {
        return { success: true, alreadyCompleted: true };
      }

      // Update attempts and mark as PROCESSING
      await db
        .update(transcodeJobsTable)
        .set({
          status: "PROCESSING",
          attempts: (jobRecord.attempts || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(transcodeJobsTable.id, jobRecord.id));

      try {
        const result = await pipelineRunner({
          dbHandle,
          jobId: jobRecord.id,
          sourceFilePath: sourceObjectKey,
          workDir,
        });

        if (!result.success) {
          throw new Error(result.error || "Transcode pipeline failed");
        }

        return result;
      } catch (err: unknown) {
        const errorMessage = (err as Error)?.message || "Transcode error";
        await db
          .update(transcodeJobsTable)
          .set({
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(transcodeJobsTable.id, jobRecord.id));

        throw err;
      }
    },
    {
      connection: {
        host: parsedRedisUrl.hostname,
        port: Number(parsedRedisUrl.port) || 6379,
        password: parsedRedisUrl.password || undefined,
        maxRetriesPerRequest: null,
      },
      concurrency,
    },
  );

  worker.on("error", () => {
    // Suppress unhandled redis connection error crashes
  });

  return {
    worker,
    close: async () => {
      await worker.close();
    },
  };
}
