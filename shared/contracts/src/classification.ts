import { z } from "zod";

const boundedString = (max = 255) => z.string().trim().min(1).max(max);

export const ClassificationLabelSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
export type ClassificationLabel = z.infer<typeof ClassificationLabelSchema>;

export const MediaMetadataSchema = z.object({
  version: z.literal(1),
  container: boundedString(64).optional(),
  durationSeconds: z.number().finite().nonnegative().optional(),
  sizeBytes: z.number().finite().int().nonnegative().optional(),
  bitrateKbps: z.number().finite().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  videoCodec: boundedString(64).optional(),
  audioCodec: boundedString(64).optional(),
  sampleRateHz: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  tags: z.record(z.string().trim().min(1).max(64)).default({}),
});
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;

export const MetadataClassificationJobPayloadSchema = z.object({
  mediaId: z.string().min(1),
  sourceAssetId: z.string().min(1),
  sourceObjectKey: z.string().min(1),
  jobType: z.literal("metadata"),
});
export type MetadataClassificationJobPayload = z.infer<
  typeof MetadataClassificationJobPayloadSchema
>;

export function getMetadataJobId(mediaId: string, sourceAssetId: string): string {
  return `metadata_${mediaId}_${sourceAssetId}`;
}
