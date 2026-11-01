import { describe, expect, it } from "vitest";
import {
  TranscodeJobPayloadSchema,
  TranscodeJobStatusResponseSchema,
  getTranscodeJobId,
} from "./transcode.js";

describe("Transcode Contracts & Idempotency Key", () => {
  it("generates deterministic job ID from (mediaId, sourceAssetId, profileVersion)", () => {
    const jobId1 = getTranscodeJobId("media-123", "asset-456", 1);
    const jobId2 = getTranscodeJobId("media-123", "asset-456", 1);
    const jobIdDiffProfile = getTranscodeJobId("media-123", "asset-456", 2);

    expect(jobId1).toBe("transcode:media-123:asset-456:1");
    expect(jobId1).toBe(jobId2);
    expect(jobId1).not.toBe(jobIdDiffProfile);
  });

  it("validates TranscodeJobPayloadSchema with valid and invalid payloads", () => {
    const valid = {
      mediaId: "123e4567-e89b-12d3-a456-426614174000",
      sourceAssetId: "123e4567-e89b-12d3-a456-426614174001",
      profileVersion: 1,
      sourceObjectKey: "uploads/source.mp4",
    };

    const parsed = TranscodeJobPayloadSchema.parse(valid);
    expect(parsed).toEqual(valid);

    expect(() =>
      TranscodeJobPayloadSchema.parse({
        mediaId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("validates TranscodeJobStatusResponseSchema", () => {
    const validResponse = {
      jobId: "transcode:m1:a1:1",
      status: "QUEUED",
      progressPercent: 0,
      attempts: 0,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = TranscodeJobStatusResponseSchema.parse(validResponse);
    expect(parsed.jobId).toBe("transcode:m1:a1:1");
    expect(parsed.status).toBe("QUEUED");
  });
});
