import { describe, expect, it } from "vitest";
import {
  AdminCreateMediaSchema,
  AdminUpdateMediaSchema,
  CursorPaginationQuerySchema,
  MediaDetailSchema,
  PaginatedMediaResponseSchema,
  SearchQuerySchema,
} from "./catalog.js";

describe("Catalog & Admin Schemas", () => {
  describe("CursorPaginationQuerySchema", () => {
    it("provides default limit 20 and parses cursor", () => {
      const parsed = CursorPaginationQuerySchema.parse({
        cursor: "eyJwdWJsaXNoZWRBdCI6IjIwMjYtMTEtMDEiLCJpZCI6IjEyMyJ9",
      });
      expect(parsed.limit).toBe(20);
      expect(parsed.cursor).toBeDefined();
    });

    it("parses type and custom limit", () => {
      const parsed = CursorPaginationQuerySchema.parse({
        type: "VIDEO",
        limit: "40",
      });
      expect(parsed.type).toBe("VIDEO");
      expect(parsed.limit).toBe(40);
    });
  });

  describe("PaginatedMediaResponseSchema", () => {
    it("validates paginated response with nextCursor", () => {
      const payload = {
        items: [
          {
            id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
            type: "VIDEO" as const,
            title: "Film Title",
            slug: "film-title",
            durationMs: 120000,
          },
        ],
        nextCursor: "next-page-cursor",
        hasMore: true,
      };
      expect(PaginatedMediaResponseSchema.parse(payload)).toEqual(payload);
    });
  });

  describe("MediaDetailSchema", () => {
    it("validates media detail with album and artists", () => {
      const detail = {
        id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        type: "AUDIO" as const,
        title: "Track Title",
        slug: "track-title",
        durationMs: 180000,
        album: {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Album One",
          slug: "album-one",
        },
        artists: [
          {
            id: "22222222-2222-2222-2222-222222222222",
            name: "Artist One",
            slug: "artist-one",
            role: "MAIN" as const,
          },
          {
            id: "33333333-3333-3333-3333-333333333333",
            name: "Artist Two",
            slug: "artist-two",
            role: "FEATURED" as const,
          },
        ],
      };
      expect(MediaDetailSchema.parse(detail)).toEqual(detail);
    });
  });

  describe("SearchQuerySchema", () => {
    it("validates search query string", () => {
      expect(SearchQuerySchema.parse({ q: "DaFt PuNk" })).toEqual({
        q: "DaFt PuNk",
        limit: 20,
      });
    });

    it("rejects empty search query", () => {
      expect(SearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
    });
  });

  describe("AdminCreateMediaSchema & AdminUpdateMediaSchema", () => {
    it("validates admin create media payload", () => {
      const payload = {
        type: "VIDEO" as const,
        title: "New Film",
        slug: "new-film",
        durationMs: 500000,
        artistIds: [
          {
            artistId: "22222222-2222-2222-2222-222222222222",
            role: "MAIN" as const,
          },
        ],
      };
      expect(AdminCreateMediaSchema.parse(payload)).toEqual(payload);
    });

    it("validates admin update media payload including status change", () => {
      const update = {
        title: "Updated Film",
        status: "READY" as const,
      };
      expect(AdminUpdateMediaSchema.parse(update)).toEqual(update);
    });
  });
});
