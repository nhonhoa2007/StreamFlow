import { describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage.service.js";

describe("StorageService", () => {
  const mockConfig = {
    STORAGE_PROVIDER: "minio" as const,
    STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    STORAGE_BUCKET_NAME: "streamflow-media-test",
    STORAGE_ACCESS_KEY_ID: "minioadmin",
    STORAGE_SECRET_ACCESS_KEY: "minioadmin",
  };

  it("generates collision-resistant object key under raw/ prefix", () => {
    const service = new StorageService(mockConfig);
    const mediaId = "11111111-1111-1111-1111-111111111111";
    const filename = "My Cool Video (1080p).mp4";

    const key1 = service.generateObjectKey(mediaId, filename);
    const key2 = service.generateObjectKey(mediaId, filename);

    expect(key1).toMatch(
      /^raw\/11111111-1111-1111-1111-111111111111\/[0-9a-f]{32}\/My_Cool_Video__1080p_\.mp4$/,
    );
    expect(key2).toMatch(
      /^raw\/11111111-1111-1111-1111-111111111111\/[0-9a-f]{32}\/My_Cool_Video__1080p_\.mp4$/,
    );
    expect(key1).not.toBe(key2); // Random salt prevents collisions
  });

  it("generates presigned upload URL with valid expiration timestamp", async () => {
    const service = new StorageService(mockConfig);
    const objectKey = "raw/media-1/salt/video.mp4";

    const { presignedUrl, expiresAt } = await service.generatePresignedUploadUrl(
      objectKey,
      "video/mp4",
      900,
    );

    expect(presignedUrl).toBeDefined();
    expect(presignedUrl).toContain("http");
    expect(presignedUrl).toContain(encodeURIComponent("streamflow-media-test"));
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 850000);
  });

  it("verifies object existence and returns metadata", async () => {
    const service = new StorageService(mockConfig);
    const mockS3Client = {
      send: vi.fn().mockResolvedValueOnce({
        ContentLength: 1048576,
        ContentType: "video/mp4",
        ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
      }),
    };
    (service as unknown as { s3Client: unknown }).s3Client = mockS3Client;

    const result = await service.verifyObjectExists("raw/media-1/salt/video.mp4");
    expect(result.exists).toBe(true);
    expect(result.sizeBytes).toBe(1048576);
    expect(result.mimeType).toBe("video/mp4");
  });

  it("returns exists: false when S3 returns NotFound / NoSuchKey", async () => {
    const service = new StorageService(mockConfig);
    const notFoundError = new Error("NotFound");
    notFoundError.name = "NotFound";

    const mockS3Client = {
      send: vi.fn().mockRejectedValueOnce(notFoundError),
    };
    (service as unknown as { s3Client: unknown }).s3Client = mockS3Client;

    const result = await service.verifyObjectExists("raw/non-existent.mp4");
    expect(result.exists).toBe(false);
  });
});
