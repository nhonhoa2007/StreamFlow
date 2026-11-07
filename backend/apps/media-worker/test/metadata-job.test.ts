import { describe, expect, it, vi } from "vitest";
import { runMetadataClassificationJob } from "../src/metadata-job.js";

describe("runMetadataClassificationJob", () => {
  it("downloads, probes, classifies, and persists without changing publication status", async () => {
    const dbHandle = {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ type: "VIDEO" }],
            }),
          }),
        }),
      },
    } as never;
    const downloaded = vi.fn(async (_key: string, destination: string) => {
      await import("node:fs/promises").then(({ writeFile }) => writeFile(destination, "fixture"));
    });
    const persisted = vi.fn(async () => undefined);

    const result = await runMetadataClassificationJob({
      dbHandle,
      mediaId: "media-1",
      sourceAssetId: "asset-1",
      sourceObjectKey: "raw/media-1/source.mp4",
      downloader: downloaded,
      prober: async () => ({
        hasVideo: true,
        hasAudio: false,
        width: 3840,
        height: 2160,
        tags: {},
      }),
      persister: persisted,
    });

    expect(downloaded).toHaveBeenCalledWith("raw/media-1/source.mp4", expect.any(String));
    expect(persisted).toHaveBeenCalledWith(
      dbHandle,
      "media-1",
      expect.objectContaining({ version: 1 }),
      ["video-4k"],
    );
    expect(result).toEqual({ labels: ["video-4k"] });
  });
});
