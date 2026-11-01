import { describe, expect, it } from "vitest";
import { buildRenditionLadder, generateMasterPlaylistContent } from "./ladder.util.js";

describe("Rendition Ladder & Master Manifest Utilities", () => {
  describe("buildRenditionLadder (Strict No-Upscaling Invariant)", () => {
    it("generates 1080p, 720p, 360p renditions for 1080p or higher source", () => {
      const ladder = buildRenditionLadder(1920, 1080, "media-1");
      expect(ladder).toHaveLength(3);
      expect(ladder.map((r) => r.name)).toEqual(["1080p", "720p", "360p"]);
      expect(ladder[0].height).toBe(1080);
      expect(ladder[0].videoBitrateKbps).toBe(4500);
      expect(ladder[1].height).toBe(720);
      expect(ladder[1].videoBitrateKbps).toBe(2200);
      expect(ladder[2].height).toBe(360);
      expect(ladder[2].videoBitrateKbps).toBe(800);
    });

    it("generates 720p and 360p renditions for 720p source without upscaling to 1080p", () => {
      const ladder = buildRenditionLadder(1280, 720, "media-2");
      expect(ladder).toHaveLength(2);
      expect(ladder.map((r) => r.name)).toEqual(["720p", "360p"]);
      expect(ladder.some((r) => r.name === "1080p")).toBe(false); // NO 1080p upscaling!
    });

    it("generates only 360p rendition for 360p source", () => {
      const ladder = buildRenditionLadder(640, 360, "media-3");
      expect(ladder).toHaveLength(1);
      expect(ladder[0].name).toBe("360p");
      expect(ladder[0].height).toBe(360);
    });

    it("generates baseline 360p even for low resolution sources (< 360p)", () => {
      const ladder = buildRenditionLadder(320, 240, "media-4");
      expect(ladder).toHaveLength(1);
      expect(ladder[0].name).toBe("360p");
    });
  });

  describe("generateMasterPlaylistContent", () => {
    it("generates valid HLS master.m3u8 linking variant playlists with bandwidth tags", () => {
      const ladder = buildRenditionLadder(1920, 1080, "media-test");
      const content = generateMasterPlaylistContent(ladder);

      expect(content).toContain("#EXTM3U");
      expect(content).toContain("#EXT-X-VERSION:3");
      expect(content).toContain("RESOLUTION=1920x1080");
      expect(content).toContain("1080p.m3u8");
      expect(content).toContain("RESOLUTION=1280x720");
      expect(content).toContain("720p.m3u8");
      expect(content).toContain("RESOLUTION=640x360");
      expect(content).toContain("360p.m3u8");
    });
  });
});
