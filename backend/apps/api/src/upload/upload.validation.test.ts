import { describe, expect, it } from "vitest";
import { validateVerifiedUpload } from "./upload.service.js";

describe("validateVerifiedUpload", () => {
  const session = {
    status: "UPLOADING" as const,
    expiresAt: new Date("2026-11-06T00:00:00.000Z"),
    expectedSize: 1024n,
    mimeType: "video/mp4",
  };

  it("rejects a session that expired before completion", () => {
    expect(() =>
      validateVerifiedUpload(
        session,
        {
          exists: true,
          sizeBytes: 1024,
          mimeType: "video/mp4",
        },
        new Date("2026-11-06T00:00:01.000Z"),
      ),
    ).toThrow(/expired/i);
  });

  it("rejects an object whose size differs from the upload contract", () => {
    expect(() =>
      validateVerifiedUpload(
        session,
        {
          exists: true,
          sizeBytes: 2048,
          mimeType: "video/mp4",
        },
        new Date("2026-11-05T23:59:00.000Z"),
      ),
    ).toThrow(/size/i);
  });

  it("rejects an object whose content type differs from the upload contract", () => {
    expect(() =>
      validateVerifiedUpload(
        session,
        {
          exists: true,
          sizeBytes: 1024,
          mimeType: "application/octet-stream",
        },
        new Date("2026-11-05T23:59:00.000Z"),
      ),
    ).toThrow(/mime/i);
  });
});
