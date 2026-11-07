import { z } from "zod";
import { ClassificationLabelSchema } from "./classification.js";
import { MediaItemSchema, MediaTypeSchema } from "./media.js";

export const MediaStatusSchema = z.enum(["DRAFT", "READY"]);
export type MediaStatus = z.infer<typeof MediaStatusSchema>;

export const ArtistRoleSchema = z.enum(["MAIN", "FEATURED", "PRODUCER"]);
export type ArtistRole = z.infer<typeof ArtistRoleSchema>;

const ClassificationQuerySchema = z.preprocess(
  (val) => (Array.isArray(val) ? "__invalid_array__" : val),
  ClassificationLabelSchema.optional(),
);

export const CursorPaginationQuerySchema = z
  .object({
    type: z.preprocess((val) => {
      if (Array.isArray(val)) return "__invalid_array__";
      return val;
    }, MediaTypeSchema.optional()),
    classification: ClassificationQuerySchema,
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
    cursor: z.string().optional(),
    sort: z.enum(["recent", "title_asc"]).optional(),
    minDurationMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
    maxDurationMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
    publishedAfter: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
      .optional(),
    publishedBefore: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.minDurationMs !== undefined &&
      value.maxDurationMs !== undefined &&
      value.minDurationMs > value.maxDurationMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minDurationMs"],
        message: "minDurationMs must be less than or equal to maxDurationMs",
      });
    }
    if (
      value.publishedAfter &&
      value.publishedBefore &&
      value.publishedAfter > value.publishedBefore
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publishedAfter"],
        message: "publishedAfter must be before publishedBefore",
      });
    }
  });
export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

export const PaginatedMediaResponseSchema = z.object({
  items: z.array(MediaItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type PaginatedMediaResponse = z.infer<typeof PaginatedMediaResponseSchema>;

export const MediaArtistDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  role: ArtistRoleSchema,
});
export type MediaArtistDetail = z.infer<typeof MediaArtistDetailSchema>;

export const MediaAlbumDetailSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
});
export type MediaAlbumDetail = z.infer<typeof MediaAlbumDetailSchema>;

export const MediaDetailSchema = MediaItemSchema.extend({
  album: MediaAlbumDetailSchema.nullable(),
  artists: z.array(MediaArtistDetailSchema),
});
export type MediaDetail = z.infer<typeof MediaDetailSchema>;

export const SearchQuerySchema = z
  .object({
    q: z.string().min(1, "Search query cannot be empty").max(100),
    cursor: z.string().optional(),
    type: MediaTypeSchema.optional(),
    classification: ClassificationQuerySchema,
    limit: z.coerce.number().int().min(1).max(50).default(20),
    sort: z.enum(["recent", "title_asc"]).optional(),
    minDurationMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
    maxDurationMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
    publishedAfter: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
      .optional(),
    publishedBefore: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.minDurationMs !== undefined &&
      value.maxDurationMs !== undefined &&
      value.minDurationMs > value.maxDurationMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minDurationMs"],
        message: "minDurationMs must be less than or equal to maxDurationMs",
      });
    }
    if (
      value.publishedAfter &&
      value.publishedBefore &&
      value.publishedAfter > value.publishedBefore
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publishedAfter"],
        message: "publishedAfter must be before publishedBefore",
      });
    }
  });
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const AdminCreateMediaSchema = z.object({
  type: MediaTypeSchema,
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  durationMs: z.number().int().nonnegative().optional(),
  albumId: z.string().uuid().optional(),
  artistIds: z
    .array(
      z.object({
        artistId: z.string().uuid(),
        role: ArtistRoleSchema.default("MAIN"),
      }),
    )
    .optional(),
});
export type AdminCreateMedia = z.infer<typeof AdminCreateMediaSchema>;

export const AdminUpdateMediaSchema = AdminCreateMediaSchema.partial().extend({
  status: MediaStatusSchema.optional(),
});
export type AdminUpdateMedia = z.infer<typeof AdminUpdateMediaSchema>;
