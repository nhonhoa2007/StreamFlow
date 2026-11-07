import { z } from "zod";
import { ArtistRoleSchema, MediaStatusSchema } from "./catalog.js";
import { MediaTypeSchema } from "./media.js";
import { TranscodeJobStatusResponseSchema } from "./transcode.js";

const dateValue = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

export const AdminMediaRecordSchema = z.object({
  id: z.string().uuid(),
  type: MediaTypeSchema,
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  albumId: z.string().uuid().nullable().optional(),
  status: MediaStatusSchema,
  publishedAt: dateValue.nullable().optional(),
  createdAt: dateValue,
  updatedAt: dateValue,
  artists: z.array(z.object({ artistId: z.string().uuid(), role: ArtistRoleSchema })).optional(),
});
export type AdminMediaRecord = z.infer<typeof AdminMediaRecordSchema>;

export const AdminMediaListResponseSchema = z.array(AdminMediaRecordSchema);
export type AdminMediaListResponse = z.infer<typeof AdminMediaListResponseSchema>;

export const AdminTranscodeJobsResponseSchema = z.array(TranscodeJobStatusResponseSchema);
export type AdminTranscodeJobsResponse = z.infer<typeof AdminTranscodeJobsResponseSchema>;
