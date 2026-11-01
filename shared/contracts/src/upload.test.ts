import { describe, expect, it } from "vitest";
import {
  CompleteUploadResponseSchema,
  InitUploadRequestSchema,
  InitUploadResponseSchema,
} from "./upload.js";

describe("Upload Contracts", () => {
  describe("InitUploadRequestSchema", () => {
    it("validates valid audio and video upload requests", () => {
      const validVideo = {
        filename: "movie.mp4",
        expectedSize: 524288000, // 500 MB
        mimeType: "video/mp4",
        type: "VIDEO",
        title: "Exciting Action Movie",
      };
      expect(InitUploadRequestSchema.parse(validVideo)).toEqual(validVideo);

      const validAudio = {
        filename: "song.flac",
        expectedSize: 31457280, // 30 MB
        mimeType: "audio/flac",
        type: "AUDIO",
        title: "Hi-Res Master Track",
      };
      expect(InitUploadRequestSchema.parse(validAudio)).toEqual(validAudio);
    });

    it("rejects unauthorized mime types (e.g. exe, zip, html)", () => {
      expect(
        InitUploadRequestSchema.safeParse({
          filename: "malware.exe",
          expectedSize: 1000,
          mimeType: "application/x-msdownload",
          type: "VIDEO",
          title: "Malware",
        }).success,
      ).toBe(false);

      expect(
        InitUploadRequestSchema.safeParse({
          filename: "archive.zip",
          expectedSize: 5000,
          mimeType: "application/zip",
          type: "AUDIO",
          title: "Zip Archive",
        }).success,
      ).toBe(false);
    });

    it("rejects files exceeding 5 GiB limit or negative size", () => {
      expect(
        InitUploadRequestSchema.safeParse({
          filename: "huge.mp4",
          expectedSize: 6 * 1024 * 1024 * 1024, // 6 GiB > 5 GiB
          mimeType: "video/mp4",
          type: "VIDEO",
          title: "Huge File",
        }).success,
      ).toBe(false);

      expect(
        InitUploadRequestSchema.safeParse({
          filename: "zero.mp4",
          expectedSize: 0,
          mimeType: "video/mp4",
          type: "VIDEO",
          title: "Zero Byte",
        }).success,
      ).toBe(false);
    });
  });

  describe("InitUploadResponseSchema & CompleteUploadResponseSchema", () => {
    it("validates InitUploadResponse", () => {
      const resp = {
        uploadId: "11111111-1111-1111-1111-111111111111",
        mediaId: "22222222-2222-2222-2222-222222222222",
        objectKey: "raw/media-1/key-123/video.mp4",
        presignedUrl: "https://r2.cloudflarestorage.com/signed-put-url",
        expiresAt: new Date().toISOString(),
      };
      expect(InitUploadResponseSchema.parse(resp)).toEqual(resp);
    });

    it("validates CompleteUploadResponse", () => {
      const resp = {
        status: "UPLOADED" as const,
        mediaId: "22222222-2222-2222-2222-222222222222",
        assetId: "33333333-3333-3333-3333-333333333333",
        objectKey: "raw/media-1/key-123/video.mp4",
        sizeBytes: 524288000,
      };
      expect(CompleteUploadResponseSchema.parse(resp)).toEqual(resp);
    });
  });
});
