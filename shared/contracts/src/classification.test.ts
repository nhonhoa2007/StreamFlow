import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ClassificationLabelSchema,
  MediaMetadataSchema,
  MetadataClassificationJobPayloadSchema,
} from "./classification.js";
import { MediaItemSchema } from "./media.js";

describe("classification contracts", () => {
  it("strips unknown metadata fields and accepts bounded optional values", () => {
    const parsed = MediaMetadataSchema.parse({
      version: 1,
      container: "mp4",
      tags: { genre: "rock" },
      unknown: "x",
    });
    expect(parsed).toEqual({ version: 1, container: "mp4", tags: { genre: "rock" } });
    expect(
      MediaMetadataSchema.safeParse({ version: 1, tags: {}, durationSeconds: -1 }).success,
    ).toBe(false);
  });
  it("validates labels and metadata job payload", () => {
    expect(ClassificationLabelSchema.safeParse("video-4k").success).toBe(true);
    expect(ClassificationLabelSchema.safeParse("Bad Label").success).toBe(false);
    expect(
      MetadataClassificationJobPayloadSchema.parse({
        mediaId: "m",
        sourceAssetId: "a",
        sourceObjectKey: "k",
        jobType: "metadata",
      }),
    ).toEqual({ mediaId: "m", sourceAssetId: "a", sourceObjectKey: "k", jobType: "metadata" });
    expect(
      MetadataClassificationJobPayloadSchema.safeParse({
        mediaId: "m",
        sourceAssetId: "a",
        sourceObjectKey: "k",
      }).success,
    ).toBe(false);
    expect(
      MetadataClassificationJobPayloadSchema.parse({
        mediaId: "m",
        sourceAssetId: "a",
        sourceObjectKey: "k",
        jobType: "metadata",
      }).jobType,
    ).toBe("metadata");
  });
  it("defaults missing media classification labels", () => {
    const parsed = MediaItemSchema.parse({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      type: "VIDEO",
      title: "x",
      slug: "x",
      durationMs: null,
    });
    expect(parsed.classificationLabels).toEqual([]);
  });
});

it("media labels use bounded slug-safe values", () => {
  expect(
    MediaItemSchema.safeParse({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      type: "VIDEO",
      title: "x",
      slug: "x",
      durationMs: null,
      classificationLabels: ["Bad Label"],
    }).success,
  ).toBe(false);
});

it("keeps MediaItemSchema composable as an object schema", () => {
  expect(
    MediaItemSchema.extend({ extra: z.string().optional() }).parse({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      type: "VIDEO",
      title: "x",
      slug: "x",
      durationMs: null,
    }).classificationLabels,
  ).toEqual([]);
});
