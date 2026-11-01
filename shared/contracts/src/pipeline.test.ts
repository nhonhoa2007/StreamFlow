import { describe, expect, it } from "vitest";
import {
  PlaybackManifestResponseSchema,
  RenditionProfileSchema,
  TranscodeJobDetailSchema,
  TranscodeStatusSchema,
} from "./pipeline.js";

describe("Pipeline & Playback Manifest Contracts", () => {
  describe("TranscodeStatusSchema & TranscodeJobDetailSchema", () => {
    it("validates valid transcode job detail", () => {
      const job = {
        id: "11111111-1111-1111-1111-111111111111",
        mediaId: "22222222-2222-2222-2222-222222222222",
        sourceAssetId: "33333333-3333-3333-3333-333333333333",
        profileVersion: 1,
        status: "PROCESSING" as const,
        progressPercent: 45,
        attempts: 1,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(TranscodeJobDetailSchema.parse(job)).toEqual(job);
    });

    it("rejects invalid transcode status", () => {
      expect(TranscodeStatusSchema.safeParse("UNKNOWN_STATUS").success).toBe(false);
    });
  });

  describe("RenditionProfileSchema", () => {
    it("validates rendition profile", () => {
      const rendition = {
        name: "720p",
        width: 1280,
        height: 720,
        videoBitrateKbps: 2200,
        audioBitrateKbps: 128,
        playlistKey: "hls/media-1/720p.m3u8",
      };

      expect(RenditionProfileSchema.parse(rendition)).toEqual(rendition);
    });
  });

  describe("PlaybackManifestResponseSchema", () => {
    it("validates playback manifest response", () => {
      const manifest = {
        mediaId: "22222222-2222-2222-2222-222222222222",
        type: "VIDEO" as const,
        title: "Test Film",
        masterPlaylistUrl: "http://127.0.0.1:9000/streamflow-media-dev/hls/media-1/master.m3u8",
        thumbnailUrl: "http://127.0.0.1:9000/streamflow-media-dev/thumbnails/media-1/poster.jpg",
        renditions: [
          {
            name: "360p",
            width: 640,
            height: 360,
            videoBitrateKbps: 800,
            audioBitrateKbps: 96,
            playlistKey: "hls/media-1/360p.m3u8",
          },
          {
            name: "720p",
            width: 1280,
            height: 720,
            videoBitrateKbps: 2200,
            audioBitrateKbps: 128,
            playlistKey: "hls/media-1/720p.m3u8",
          },
        ],
      };

      expect(PlaybackManifestResponseSchema.parse(manifest)).toEqual(manifest);
    });
  });
});
