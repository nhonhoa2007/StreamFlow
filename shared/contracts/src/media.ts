import { z } from "zod";
import { ClassificationLabelSchema } from "./classification.js";

export const MediaTypeSchema = z.enum(["AUDIO", "VIDEO"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaListQuerySchema = z.object({
  type: z.preprocess((val) => {
    if (Array.isArray(val)) return "__invalid_array__";
    return val;
  }, MediaTypeSchema.optional()),
  limit: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === "") return 20;
      if (typeof val === "string") {
        const n = Number(val);
        return Number.isInteger(n) ? n : val;
      }
      return val;
    }, z.number().int().min(1).max(50))
    .default(20),
});
export type MediaListQuery = z.infer<typeof MediaListQuerySchema>;

export const MediaItemSchema = z.object({
  id: z.string().uuid(),
  type: MediaTypeSchema,
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  durationMs: z.number().int().nonnegative().nullable(),
  classificationLabels: z.array(ClassificationLabelSchema).default([]),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const MediaListResponseSchema = z.object({
  items: z.array(MediaItemSchema),
});
export type MediaListResponse = z.infer<typeof MediaListResponseSchema>;
