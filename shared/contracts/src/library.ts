import { z } from "zod";
import { MediaItemSchema } from "./media.js";

export const FavoriteItemSchema = z.object({
  mediaId: z.string().uuid(),
  createdAt: z.string(),
  media: MediaItemSchema,
});
export type FavoriteItem = z.infer<typeof FavoriteItemSchema>;

export const FavoriteListResponseSchema = z.object({
  items: z.array(FavoriteItemSchema),
});
export type FavoriteListResponse = z.infer<typeof FavoriteListResponseSchema>;

export const ContinueItemSchema = z.object({
  mediaId: z.string().uuid(),
  positionMs: z.number().int().nonnegative(),
  updatedAt: z.string(),
  media: MediaItemSchema,
});
export type ContinueItem = z.infer<typeof ContinueItemSchema>;

export const ContinueWatchingResponseSchema = z.object({
  items: z.array(ContinueItemSchema),
});
export type ContinueWatchingResponse = z.infer<typeof ContinueWatchingResponseSchema>;

export const LibraryHistoryResponseSchema = z.object({
  items: z.array(ContinueItemSchema),
});
export type LibraryHistoryResponse = z.infer<typeof LibraryHistoryResponseSchema>;
