import { describe, expect, it } from "vitest";
import { parseProbeOutput } from "./probe.util.js";

describe("parseProbeOutput", () => {
  it("normalizes known format and stream fields and presence", () => {
    expect(
      parseProbeOutput({
        format: {
          format_name: "matroska,webm",
          duration: "12.5",
          size: "1000",
          bit_rate: "800000",
          tags: { TITLE: "T", GENRE: "Rock" },
          ignored: "x",
        },
        streams: [
          {
            codec_type: "video",
            width: 1920,
            height: 1080,
            codec_name: "h264",
            bit_rate: "700000",
            tags: { LANGUAGE: "en" },
          },
          {
            codec_type: "audio",
            codec_name: "flac",
            sample_rate: "48000",
            channels: 2,
            tags: { genre: "Jazz" },
          },
        ],
      }),
    ).toMatchObject({
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      videoCodec: "h264",
      audioCodec: "flac",
      durationSeconds: 12.5,
      sizeBytes: 1000,
      bitrateKbps: 800,
      container: "matroska",
      sampleRateHz: 48000,
      channels: 2,
      tags: { title: "T", genre: "Jazz" },
    });
  });
  it("omits malformed optional values", () => {
    const parsed = parseProbeOutput({
      format: { duration: "bad", size: "-1" },
      streams: [{ codec_type: "video", width: "bad", height: 0 }],
    });
    expect(parsed.durationSeconds).toBeUndefined();
    expect(parsed.sizeBytes).toBeUndefined();
    expect(parsed.width).toBeUndefined();
    expect(parsed.hasVideo).toBe(true);
  });
});
