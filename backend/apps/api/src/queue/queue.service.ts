import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { ApiEnv } from "@streamflow/config";
import {
  type TranscodeJobPayload,
  type TranscodeJobStatusResponse,
  type TranscodeStatus,
  getTranscodeJobId,
} from "@streamflow/contracts";
import { type DatabaseHandle, mediaAssetsTable, transcodeJobsTable } from "@streamflow/database";
import { Queue } from "bullmq";
import { and, desc, eq } from "drizzle-orm";
import { API_CONFIG_TOKEN, DATABASE_HANDLE_TOKEN } from "../constants.js";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly transcodeQueue: Queue<TranscodeJobPayload>;

  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
    @Inject(API_CONFIG_TOKEN)
    private readonly config: ApiEnv,
  ) {
    const redisUrl = new URL(config.REDIS_URL || "redis://127.0.0.1:6379");
    this.transcodeQueue = new Queue<TranscodeJobPayload>(
      config.TRANSCODE_QUEUE_NAME || "media-transcode-queue",
      {
        connection: {
          host: redisUrl.hostname,
          port: Number(redisUrl.port) || 6379,
          password: redisUrl.password || undefined,
          maxRetriesPerRequest: null,
        },
      },
    );
    this.transcodeQueue.on("error", () => {
      // Fail-open: suppress unhandled redis connection errors
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.transcodeQueue.close();
  }

  async enqueueTranscode(
    mediaId: string,
    profileVersion = 1,
  ): Promise<{ jobId: string; status: string }> {
    const db = this.databaseHandle.db;

    // Find source video asset for this media item
    const [sourceAsset] = await db
      .select()
      .from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.mediaId, mediaId), eq(mediaAssetsTable.kind, "SOURCE_VIDEO")))
      .limit(1);

    if (!sourceAsset) {
      throw new BadRequestException("No SOURCE_VIDEO asset found for media item");
    }

    const jobId = getTranscodeJobId(mediaId, sourceAsset.id, profileVersion);

    // Upsert transcode_jobs record atomically with onConflictDoNothing
    await db
      .insert(transcodeJobsTable)
      .values({
        mediaId,
        sourceAssetId: sourceAsset.id,
        profileVersion,
        status: "QUEUED",
        progressPercent: 0,
        attempts: 0,
      })
      .onConflictDoNothing();

    const [jobRecord] = await db
      .select()
      .from(transcodeJobsTable)
      .where(
        and(
          eq(transcodeJobsTable.mediaId, mediaId),
          eq(transcodeJobsTable.sourceAssetId, sourceAsset.id),
          eq(transcodeJobsTable.profileVersion, profileVersion),
        ),
      )
      .limit(1);

    // If job already finished, return status without re-enqueuing
    if (jobRecord && jobRecord.status === "COMPLETED") {
      return {
        jobId,
        status: "COMPLETED",
      };
    }

    // Enqueue to BullMQ with deterministic jobId
    const payload: TranscodeJobPayload = {
      mediaId,
      sourceAssetId: sourceAsset.id,
      profileVersion,
      sourceObjectKey: sourceAsset.objectKey,
    };

    await this.transcodeQueue.add("transcode", payload, {
      jobId,
      attempts: this.config.TRANSCODE_MAX_ATTEMPTS || 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    });

    return {
      jobId,
      status: jobRecord ? jobRecord.status : "QUEUED",
    };
  }

  async getJobStatus(jobIdentifier: string): Promise<TranscodeJobStatusResponse> {
    const db = this.databaseHandle.db;

    let jobRecord: typeof transcodeJobsTable.$inferSelect | undefined;

    if (jobIdentifier.startsWith("transcode_")) {
      const parts = jobIdentifier.split("_");
      if (parts.length !== 4) {
        throw new BadRequestException("Malformed transcode job ID format");
      }
      const [, mediaId, sourceAssetId, profileVersionStr] = parts;
      const profileVersion = Number(profileVersionStr);
      const [found] = await db
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
      jobRecord = found;
    } else {
      const [found] = await db
        .select()
        .from(transcodeJobsTable)
        .where(eq(transcodeJobsTable.id, jobIdentifier))
        .limit(1);
      jobRecord = found;
    }

    if (!jobRecord) {
      throw new NotFoundException(`Transcode job not found: ${jobIdentifier}`);
    }

    return {
      jobId: getTranscodeJobId(
        jobRecord.mediaId,
        jobRecord.sourceAssetId,
        jobRecord.profileVersion,
      ),
      status: jobRecord.status as TranscodeStatus,
      progressPercent: jobRecord.progressPercent,
      attempts: jobRecord.attempts,
      errorMessage: jobRecord.errorMessage,
      createdAt: jobRecord.createdAt.toISOString(),
      updatedAt: jobRecord.updatedAt.toISOString(),
    };
  }

  async getJobsForMedia(mediaId: string): Promise<TranscodeJobStatusResponse[]> {
    const db = this.databaseHandle.db;

    const records = await db
      .select()
      .from(transcodeJobsTable)
      .where(eq(transcodeJobsTable.mediaId, mediaId))
      .orderBy(desc(transcodeJobsTable.createdAt));

    return records.map((jobRecord) => ({
      jobId: getTranscodeJobId(
        jobRecord.mediaId,
        jobRecord.sourceAssetId,
        jobRecord.profileVersion,
      ),
      status: jobRecord.status as TranscodeStatus,
      progressPercent: jobRecord.progressPercent,
      attempts: jobRecord.attempts,
      errorMessage: jobRecord.errorMessage,
      createdAt: jobRecord.createdAt.toISOString(),
      updatedAt: jobRecord.updatedAt.toISOString(),
    }));
  }
}
