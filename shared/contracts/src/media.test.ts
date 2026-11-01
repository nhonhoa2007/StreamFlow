import { describe, expect, it } from "vitest";
import { MediaItemSchema, MediaListQuerySchema, MediaListResponseSchema } from "./media.js";

describe("MediaListQuerySchema", () => {
  it("defaults limit to 20 when empty object provided", () => {
    const result = MediaListQuerySchema.parse({});
    expect(result).toEqual({ limit: 20 });
  });

  it("parses valid type and limit as string or number", () => {
    const result = MediaListQuerySchema.parse({ type: "VIDEO", limit: "50" });
    expect(result).toEqual({ type: "VIDEO", limit: 50 });

    const audioResult = MediaListQuerySchema.parse({ type: "AUDIO", limit: 10 });
    expect(audioResult).toEqual({ type: "AUDIO", limit: 10 });
  });

  it("rejects invalid type", () => {
    const result = MediaListQuerySchema.safeParse({ type: "PODCAST" });
    expect(result.success).toBe(false);
  });

  it("rejects limit less than 1 or greater than 50", () => {
    expect(MediaListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(MediaListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(MediaListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(MediaListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it("rejects decimal or non-numeric limit", () => {
    expect(MediaListQuerySchema.safeParse({ limit: "12.5" }).success).toBe(false);
    expect(MediaListQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
  });

  it("rejects repeated/array query parameters", () => {
    expect(MediaListQuerySchema.safeParse({ limit: ["10", "20"] }).success).toBe(false);
    expect(MediaListQuerySchema.safeParse({ type: ["AUDIO", "VIDEO"] }).success).toBe(false);
  });
});

describe("MediaItemSchema and MediaListResponseSchema", () => {
  it("parses valid MediaItem and strips internal database fields", () => {
    const raw = {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      type: "VIDEO",
      title: "Test Film",
      slug: "test-film",
      durationMs: 120000,
      status: "READY",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = MediaItemSchema.parse(raw);
    expect(parsed).toEqual({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      type: "VIDEO",
      title: "Test Film",
      slug: "test-film",
      durationMs: 120000,
    });
    expect((parsed as Record<string, unknown>).status).toBeUndefined();
    expect((parsed as Record<string, unknown>).createdAt).toBeUndefined();
  });

  it("allows null durationMs", () => {
    const item = {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      type: "AUDIO",
      title: "Podcast Episode",
      slug: "podcast-episode",
      durationMs: null,
    };
    expect(MediaItemSchema.parse(item)).toEqual(item);
  });

  it("rejects invalid media item missing required fields", () => {
    expect(MediaItemSchema.safeParse({ title: "No ID" }).success).toBe(false);
  });

  it("parses valid MediaListResponse", () => {
    const response = {
      items: [
        {
          id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          type: "AUDIO",
          title: "Audio Track",
          slug: "audio-track",
          durationMs: 60000,
        },
      ],
    };
    expect(MediaListResponseSchema.parse(response)).toEqual(response);
  });
});
