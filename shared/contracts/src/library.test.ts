import { describe, expect, it } from "vitest";
import {
  AddPlaylistItemSchema,
  ContinueItemSchema,
  CreatePlaylistSchema,
  FavoriteItemSchema,
  PlaylistDetailSchema,
  ReorderPlaylistItemsSchema,
  StartPlaybackResponseSchema,
  UpdatePlaylistSchema,
  UpdateProgressSchema,
} from "./index.js";

describe("M03 Library, Playlist & Playback Contracts", () => {
  const sampleMedia = {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    type: "AUDIO" as const,
    title: "Awesome Song",
    slug: "awesome-song",
    durationMs: 240000,
    classificationLabels: [],
  };

  describe("Favorites & Continue Watching", () => {
    it("validates FavoriteItemSchema", () => {
      const fav = {
        mediaId: sampleMedia.id,
        createdAt: new Date().toISOString(),
        media: sampleMedia,
      };
      expect(FavoriteItemSchema.parse(fav)).toEqual(fav);
    });

    it("validates ContinueItemSchema with resume position", () => {
      const item = {
        mediaId: sampleMedia.id,
        positionMs: 65000,
        updatedAt: new Date().toISOString(),
        media: sampleMedia,
      };
      expect(ContinueItemSchema.parse(item)).toEqual(item);
    });
  });

  describe("Playlist Schemas", () => {
    it("validates CreatePlaylistSchema", () => {
      expect(CreatePlaylistSchema.parse({ name: "Work Workout" })).toEqual({
        name: "Work Workout",
      });

      expect(CreatePlaylistSchema.safeParse({ name: "" }).success).toBe(false);
      expect(CreatePlaylistSchema.safeParse({ name: "a".repeat(256) }).success).toBe(false);
    });

    it("validates UpdatePlaylistSchema", () => {
      expect(
        UpdatePlaylistSchema.parse({
          name: "Updated Name",
          description: "New description",
        }),
      ).toEqual({
        name: "Updated Name",
        description: "New description",
      });
    });

    it("validates AddPlaylistItemSchema", () => {
      expect(AddPlaylistItemSchema.parse({ mediaId: sampleMedia.id })).toEqual({
        mediaId: sampleMedia.id,
      });
      expect(AddPlaylistItemSchema.safeParse({ mediaId: "not-a-uuid" }).success).toBe(false);
    });

    it("validates ReorderPlaylistItemsSchema requiring positive expectedVersion and itemIds", () => {
      const valid = {
        expectedVersion: 3,
        itemIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
      };
      expect(ReorderPlaylistItemsSchema.parse(valid)).toEqual(valid);

      expect(
        ReorderPlaylistItemsSchema.safeParse({
          expectedVersion: 0,
          itemIds: valid.itemIds,
        }).success,
      ).toBe(false);

      expect(
        ReorderPlaylistItemsSchema.safeParse({
          expectedVersion: 1,
          itemIds: [],
        }).success,
      ).toBe(false);
    });

    it("validates PlaylistDetailSchema", () => {
      const detail = {
        id: "44444444-4444-4444-4444-444444444444",
        ownerId: "55555555-5555-5555-5555-555555555555",
        name: "My Synthwave Mix",
        description: null,
        version: 1,
        items: [
          {
            id: "66666666-6666-6666-6666-666666666666",
            mediaId: sampleMedia.id,
            position: 0,
            addedAt: new Date().toISOString(),
            media: sampleMedia,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(PlaylistDetailSchema.parse(detail)).toEqual(detail);
    });
  });

  describe("Playback Telemetry Schemas", () => {
    it("validates StartPlaybackResponseSchema", () => {
      const resp = {
        sessionId: "77777777-7777-7777-7777-777777777777",
        mediaId: sampleMedia.id,
        positionMs: 12000,
      };
      expect(StartPlaybackResponseSchema.parse(resp)).toEqual(resp);
    });

    it("validates UpdateProgressSchema requiring positive sequence and non-negative positionMs", () => {
      const progress = {
        sequence: 4,
        positionMs: 32500,
      };
      expect(UpdateProgressSchema.parse(progress)).toEqual(progress);

      expect(
        UpdateProgressSchema.safeParse({
          sequence: 0,
          positionMs: 100,
        }).success,
      ).toBe(false);

      expect(
        UpdateProgressSchema.safeParse({
          sequence: 1,
          positionMs: -50,
        }).success,
      ).toBe(false);
    });
  });
});
