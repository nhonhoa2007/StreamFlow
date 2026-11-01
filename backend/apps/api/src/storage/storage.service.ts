import crypto from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import { API_CONFIG_TOKEN } from "../constants.js";

export interface StorageConfig {
  STORAGE_PROVIDER?: "minio" | "cloudflare_r2";
  STORAGE_ENDPOINT?: string;
  STORAGE_BUCKET_NAME?: string;
  STORAGE_ACCESS_KEY_ID?: string;
  STORAGE_SECRET_ACCESS_KEY?: string;
  STORAGE_PUBLIC_URL?: string;
}

export interface VerifiedObjectMetadata {
  exists: boolean;
  sizeBytes?: number;
  mimeType?: string;
  checksum?: string;
}

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    @Inject(API_CONFIG_TOKEN)
    private readonly config: StorageConfig,
  ) {
    const endpoint = this.config.STORAGE_ENDPOINT || "http://127.0.0.1:9000";
    this.bucketName = this.config.STORAGE_BUCKET_NAME || "streamflow-media-dev";

    const accessKeyId = this.config.STORAGE_ACCESS_KEY_ID || "minioadmin";
    const secretAccessKey = this.config.STORAGE_SECRET_ACCESS_KEY || "minioadmin";

    // MinIO requires forcePathStyle: true; Cloudflare R2 works with both
    const isMinIO = (this.config.STORAGE_PROVIDER ?? "minio") === "minio";

    this.s3Client = new S3Client({
      endpoint,
      region: "auto",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: isMinIO,
    });
  }

  generateObjectKey(mediaId: string, filename: string): string {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const salt = crypto.randomBytes(16).toString("hex");
    return `raw/${mediaId}/${salt}/${sanitizedFilename}`;
  }

  async generatePresignedUploadUrl(
    objectKey: string,
    mimeType: string,
    expiresInSeconds = 900,
  ): Promise<{ presignedUrl: string; expiresAt: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: mimeType,
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      presignedUrl,
      expiresAt,
    };
  }

  async verifyObjectExists(objectKey: string): Promise<VerifiedObjectMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });

      const res = await this.s3Client.send(command);

      return {
        exists: true,
        sizeBytes: res.ContentLength,
        mimeType: res.ContentType,
        checksum: res.ETag ? res.ETag.replace(/"/g, "") : undefined,
      };
    } catch (err: unknown) {
      const errorName = (err as { name?: string })?.name;
      const httpCode = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;

      if (errorName === "NotFound" || errorName === "NoSuchKey" || httpCode === 404) {
        return { exists: false };
      }

      // Any unexpected S3 error is logged and returns false
      return { exists: false };
    }
  }
}
