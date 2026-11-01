import { z } from "zod";
import { TranscodeStatusSchema } from "./pipeline.js";

export const TranscodeJobPayloadSchema = z.object({
  mediaId: z.string().uuid(),
  sourceAssetId: z.string().uuid(),
  profileVersion: z.number().int().positive().default(1),
  sourceObjectKey: z.string().min(1),
});

export type TranscodeJobPayload = z.infer<typeof TranscodeJobPayloadSchema>;

export const TranscodeJobStatusResponseSchema = z.object({
  jobId: z.string(),
  status: TranscodeStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  attempts: z.number().int().min(0),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TranscodeJobStatusResponse = z.infer<typeof TranscodeJobStatusResponseSchema>;

export function getTranscodeJobId(
  mediaId: string,
  sourceAssetId: string,
  profileVersion: number = 1,
): string {
  return `transcode:${mediaId}:${sourceAssetId}:${profileVersion}`;
}

