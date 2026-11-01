import { z } from "zod";
import { MediaTypeSchema } from "./media.js";

export const TranscodeStatusSchema = z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]);
export type TranscodeStatus = z.infer<typeof TranscodeStatusSchema>;

export const TranscodeJobDetailSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid(),
  sourceAssetId: z.string().uuid(),
  profileVersion: z.number().int().positive(),
  status: TranscodeStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  attempts: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TranscodeJobDetail = z.infer<typeof TranscodeJobDetailSchema>;

export const RenditionProfileSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  videoBitrateKbps: z.number().int().positive(),
  audioBitrateKbps: z.number().int().positive(),
  playlistKey: z.string(),
});
export type RenditionProfile = z.infer<typeof RenditionProfileSchema>;

export const PlaybackManifestResponseSchema = z.object({
  mediaId: z.string().uuid(),
  type: MediaTypeSchema,
  title: z.string(),
  masterPlaylistUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  renditions: z.array(RenditionProfileSchema),
});
export type PlaybackManifestResponse = z.infer<typeof PlaybackManifestResponseSchema>;
