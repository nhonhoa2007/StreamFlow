import { describe, expect, it } from "vitest";
import { classifyMedia } from "./classification.js";

describe("classifyMedia", () => {
  it("classifies video boundaries and sorted deduped genres", () => {
    const base = {
      hasVideo: true,
      hasAudio: false,
      width: 2160,
      height: 1080,
      tags: { genre: " Rock; jazz /rock!!! " },
    };
    expect(classifyMedia(base, "VIDEO").labels).toEqual(["video-4k", "jazz", "rock"]);
    expect(classifyMedia({ ...base, width: 720, height: 400 }, "VIDEO").labels[0]).toBe("video-hd");
    expect(classifyMedia({ ...base, width: 719, height: 400 }, "VIDEO").labels[0]).toBe("video-sd");
  });
  it("classifies lossless and lossy audio codecs", () => {
    for (const codec of ["flac", "alac", "pcm_s16le"])
      expect(
        classifyMedia({ hasAudio: true, hasVideo: false, audioCodec: codec, tags: {} }, "AUDIO")
          .labels[0],
      ).toBe("audio-lossless");
    for (const codec of ["aac", "mp3", "opus"])
      expect(
        classifyMedia({ hasAudio: true, hasVideo: false, audioCodec: codec, tags: {} }, "AUDIO")
          .labels[0],
      ).toBe("audio-lossy");
  });
  it("handles missing optional fields", () => {
    expect(classifyMedia({ hasVideo: true, hasAudio: false, tags: {} }, "VIDEO").labels).toEqual([
      "video-sd",
    ]);
    expect(classifyMedia({ hasVideo: false, hasAudio: false, tags: {} }, "AUDIO").labels).toEqual(
      [],
    );
  });
});

it("does not classify malformed dimensions while missing dimensions fall back to SD", () => {
  expect(
    classifyMedia(
      { hasVideo: true, hasAudio: false, width: -1, height: 0, dimensionsInvalid: true, tags: {} },
      "VIDEO",
    ).labels,
  ).toEqual([]);
  expect(classifyMedia({ hasVideo: true, hasAudio: false, tags: {} }, "VIDEO").labels).toEqual([
    "video-sd",
  ]);
});

it("normalizes malformed probe metadata without throwing", () => {
  const result = classifyMedia(
    {
      hasVideo: false,
      hasAudio: false,
      durationSeconds: -1,
      tags: { genre: "Jazz", bad: 3 as unknown as string },
    },
    "AUDIO",
  );
  expect(result.metadata).toEqual({ version: 1, tags: { genre: "Jazz" } });
});

it("omits every malformed metadata field without throwing", () => {
  const result = classifyMedia(
    {
      hasVideo: true,
      hasAudio: true,
      dimensionsInvalid: true,
      width: 1.5,
      height: "bad" as unknown as number,
      durationSeconds: Number.POSITIVE_INFINITY,
      sizeBytes: -4,
      bitrateKbps: "x" as unknown as number,
      sampleRateHz: 0,
      channels: 1.2,
      tags: { genre: "Rock", title: "x".repeat(100) },
    },
    "VIDEO",
  );
  expect(result.metadata).toEqual({ version: 1, tags: { genre: "Rock", title: "x".repeat(64) } });
});

it("drops malformed bounded strings without throwing", () => {
  const result = classifyMedia(
    {
      hasVideo: false,
      hasAudio: true,
      container: " ",
      videoCodec: "x".repeat(100),
      audioCodec: "",
      tags: { genre: "  ", title: "x".repeat(100) },
    },
    "AUDIO",
  );
  expect(result.metadata).toEqual({ version: 1, tags: { title: "x".repeat(64) } });
});
