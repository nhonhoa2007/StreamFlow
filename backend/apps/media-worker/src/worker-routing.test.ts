import { describe, expect, it } from "vitest";
import { isMetadataClassificationJob } from "./worker.js";

describe("metadata worker routing", () => {
  it("routes only payloads carrying the metadata discriminator", () => {
    expect(
      isMetadataClassificationJob({
        jobType: "metadata",
        mediaId: "m",
        sourceAssetId: "a",
        sourceObjectKey: "k",
      }),
    ).toBe(true);
    expect(
      isMetadataClassificationJob({ mediaId: "m", sourceAssetId: "a", sourceObjectKey: "k" }),
    ).toBe(false);
    expect(isMetadataClassificationJob({ jobType: "metadata", mediaId: "m" })).toBe(false);
    expect(isMetadataClassificationJob({ kind: "metadata", mediaId: "m" })).toBe(false);
    expect(isMetadataClassificationJob({ type: "metadata", mediaId: "m" })).toBe(false);
  });
});
