import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CompleteUploadResponse,
  InitUploadRequest,
  InitUploadResponse,
  UploadSessionDetail,
} from "@streamflow/contracts";
import {
  type DatabaseHandle,
  completeUploadSessionAndCreateAsset,
  createUploadSession,
  expireOldUploadSessions,
  findMediaAssetByObjectKey,
  findUploadSessionById,
  mediaTable,
} from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { QueueService } from "../queue/queue.service.js";
import { StorageService } from "../storage/storage.service.js";

export function validateVerifiedUpload(
  session: {
    status: "UPLOADING" | "UPLOADED" | "EXPIRED" | "FAILED";
    expiresAt: Date;
    expectedSize: bigint;
    mimeType: string;
  },
  verified: { exists: boolean; sizeBytes?: number; mimeType?: string },
  now = new Date(),
): void {
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new BadRequestException("Upload session has expired");
  }

  if (!verified.exists) {
    throw new BadRequestException("Uploaded file not found in storage. Upload was not completed.");
  }

  if (verified.sizeBytes === undefined || BigInt(verified.sizeBytes) !== session.expectedSize) {
    throw new BadRequestException("Uploaded file size does not match the upload contract");
  }

  const expectedMimeType = session.mimeType.split(";", 1)[0].trim().toLowerCase();
  const actualMimeType = verified.mimeType?.split(";", 1)[0].trim().toLowerCase();
  if (!actualMimeType || actualMimeType !== expectedMimeType) {
    throw new BadRequestException("Uploaded file MIME type does not match the upload contract");
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

@Injectable()
export class UploadService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
    @Inject(StorageService)
    private readonly storageService: StorageService,
    @Inject(QueueService)
    private readonly queueService: QueueService,
  ) {}

  async init(userId: string, data: InitUploadRequest): Promise<InitUploadResponse> {
    const db = this.databaseHandle.db;

    // 1. Create a draft media item
    const baseSlug = slugify(data.title) || `media-${Date.now()}`;
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;

    const [media] = await db
      .insert(mediaTable)
      .values({
        type: data.type,
        title: data.title,
        slug,
        status: "DRAFT",
      })
      .returning();

    // 2. Allocate random object key and generate presigned PUT url
    const objectKey = this.storageService.generateObjectKey(media.id, data.filename);
    const { presignedUrl, expiresAt } = await this.storageService.generatePresignedUploadUrl(
      objectKey,
      data.mimeType,
      900,
    );

    // 3. Create upload session
    const session = await createUploadSession(db, {
      userId,
      mediaId: media.id,
      objectKey,
      filename: data.filename,
      mimeType: data.mimeType,
      expectedSize: BigInt(data.expectedSize),
      status: "UPLOADING",
      expiresAt: new Date(expiresAt),
    });

    return {
      uploadId: session.id,
      mediaId: media.id,
      objectKey,
      presignedUrl,
      expiresAt,
    };
  }

  async complete(uploadId: string, userId: string): Promise<CompleteUploadResponse> {
    const db = this.databaseHandle.db;

    const session = await findUploadSessionById(db, uploadId);
    if (!session) {
      throw new NotFoundException("Upload session not found");
    }
    if (session.userId !== userId) {
      throw new NotFoundException("Upload session not found");
    }

    // Idempotency: if already uploaded, return existing asset without duplicate inserts
    if (session.status === "UPLOADED") {
      const existingAsset = await findMediaAssetByObjectKey(db, session.objectKey);
      if (existingAsset) {
        // The asset transaction may have committed while Redis was unavailable.
        // Re-attempt the deterministic enqueue on every idempotent replay so
        // classification cannot be lost permanently.
        if (existingAsset.kind === "SOURCE_AUDIO") {
          await this.queueService.enqueueMetadataClassification(
            session.mediaId ?? existingAsset.mediaId,
            existingAsset.id,
          );
        }
        return {
          status: "ALREADY_COMPLETED",
          mediaId: session.mediaId ?? existingAsset.mediaId,
          assetId: existingAsset.id,
          objectKey: existingAsset.objectKey,
          sizeBytes: Number(existingAsset.sizeBytes),
        };
      }
    }

    // Server-side verification via S3 HeadObject
    const verified = await this.storageService.verifyObjectExists(session.objectKey);
    validateVerifiedUpload(session, verified);

    if (!session.mediaId) {
      throw new BadRequestException("Upload session is not linked to a media item");
    }

    const mediaId = session.mediaId;
    const kind = session.mimeType.startsWith("video/") ? "SOURCE_VIDEO" : "SOURCE_AUDIO";
    const sizeBytes = BigInt(verified.sizeBytes ?? Number(session.expectedSize));

    let asset: Awaited<ReturnType<typeof completeUploadSessionAndCreateAsset>>;
    try {
      asset = await completeUploadSessionAndCreateAsset(db, session.id, {
        mediaId,
        kind,
        objectKey: session.objectKey,
        sizeBytes,
        mimeType: session.mimeType,
        checksum: verified.checksum,
      });
    } catch (err: unknown) {
      if ((err as Error)?.message === "UPLOAD_SESSION_NOT_ACTIVE") {
        throw new BadRequestException("Upload session is no longer active");
      }
      throw err;
    }

    if (asset.kind === "SOURCE_AUDIO") {
      await this.queueService.enqueueMetadataClassification(mediaId, asset.id);
    }

    return {
      status: "UPLOADED",
      mediaId,
      assetId: asset.id,
      objectKey: session.objectKey,
      sizeBytes: Number(asset.sizeBytes),
    };
  }

  async getSession(uploadId: string, userId: string): Promise<UploadSessionDetail> {
    const session = await findUploadSessionById(this.databaseHandle.db, uploadId);
    if (!session) {
      throw new NotFoundException("Upload session not found");
    }
    if (session.userId !== userId) {
      throw new NotFoundException("Upload session not found");
    }

    return {
      id: session.id,
      userId: session.userId,
      mediaId: session.mediaId,
      objectKey: session.objectKey,
      filename: session.filename,
      mimeType: session.mimeType,
      expectedSize: Number(session.expectedSize),
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  async cleanupExpired(): Promise<{ expiredCount: number }> {
    const expiredCount = await expireOldUploadSessions(this.databaseHandle.db);
    return { expiredCount };
  }
}
