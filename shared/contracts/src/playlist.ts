import { z } from "zod";
import { MediaItemSchema } from "./media.js";

export const CreatePlaylistSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(255),
  description: z.string().max(1000).optional(),
});
export type CreatePlaylist = z.infer<typeof CreatePlaylistSchema>;

export const UpdatePlaylistSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(255).optional(),
  description: z.string().max(1000).optional(),
});
export type UpdatePlaylist = z.infer<typeof UpdatePlaylistSchema>;

export const AddPlaylistItemSchema = z.object({
  mediaId: z.string().uuid("Invalid media ID"),
});
export type AddPlaylistItem = z.infer<typeof AddPlaylistItemSchema>;

export const ReorderPlaylistItemsSchema = z.object({
  expectedVersion: z.number().int().positive("expectedVersion must be a positive integer"),
  itemIds: z.array(z.string().uuid("Invalid item ID")).min(1, "itemIds cannot be empty"),
});
export type ReorderPlaylistItems = z.infer<typeof ReorderPlaylistItemsSchema>;

export const PlaylistItemDetailSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  addedAt: z.string(),
  media: MediaItemSchema,
});
export type PlaylistItemDetail = z.infer<typeof PlaylistItemDetailSchema>;

export const PlaylistSummarySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.number().int().positive(),
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlaylistSummary = z.infer<typeof PlaylistSummarySchema>;

export const PlaylistDetailSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.number().int().positive(),
  items: z.array(PlaylistItemDetailSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>;
