import { z } from "zod";
import { MediaTypeSchema } from "./media.js";

export const UploadMimeTypeSchema = z.enum([
  "audio/mpeg",
  "audio/wav",
  "audio/flac",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
export type UploadMimeType = z.infer<typeof UploadMimeTypeSchema>;

export const InitUploadRequestSchema = z.object({
  filename: z.string().min(1, "Filename cannot be empty").max(255),
  expectedSize: z
    .number()
    .int()
    .positive("expectedSize must be positive")
    .max(5 * 1024 * 1024 * 1024, "Max file size is 5 GiB"),
  mimeType: UploadMimeTypeSchema,
  type: MediaTypeSchema,
  title: z.string().min(1, "Title cannot be empty").max(255),
});
export type InitUploadRequest = z.infer<typeof InitUploadRequestSchema>;

export const InitUploadResponseSchema = z.object({
  uploadId: z.string().uuid(),
  mediaId: z.string().uuid(),
  objectKey: z.string().min(1),
  presignedUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type InitUploadResponse = z.infer<typeof InitUploadResponseSchema>;

export const CompleteUploadResponseSchema = z.object({
  status: z.enum(["UPLOADED", "ALREADY_COMPLETED"]),
  mediaId: z.string().uuid(),
  assetId: z.string().uuid(),
  objectKey: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>;

export const UploadSessionStatusSchema = z.enum(["UPLOADING", "UPLOADED", "EXPIRED", "FAILED"]);
export type UploadSessionStatus = z.infer<typeof UploadSessionStatusSchema>;

export const UploadSessionDetailSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  mediaId: z.string().uuid().nullable(),
  objectKey: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  expectedSize: z.number(),
  status: UploadSessionStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UploadSessionDetail = z.infer<typeof UploadSessionDetailSchema>;
