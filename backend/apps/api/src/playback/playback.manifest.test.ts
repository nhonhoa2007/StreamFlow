import type { DatabaseHandle } from "@streamflow/database";
import { describe, expect, it, vi } from "vitest";
import { PlaybackService } from "./playback.service.js";
function handle(type: "AUDIO" | "VIDEO", assets: Record<string, unknown>[]): DatabaseHandle {
  const db = {
    select: vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => [{ id: "media", type, title: "Title" }] }) }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => assets }) }),
  };
  return { db } as unknown as DatabaseHandle;
}
describe("playback source selection", () => {
  it("provides the original audio URL when a source audio asset exists", async () => {
    const service = new PlaybackService(
      handle("AUDIO", [{ kind: "SOURCE_AUDIO", objectKey: "raw/recording.mp3" }]),
      { STORAGE_PUBLIC_URL: "https://media.example.com" },
    );
    const result = await service.getManifest("media");
    expect(result.sourceUrl).toBe("https://media.example.com/raw/recording.mp3");
  });
  it("keeps video playback on HLS without exposing the original video", async () => {
    const service = new PlaybackService(
      handle("VIDEO", [
        { kind: "SOURCE_VIDEO", objectKey: "raw/movie.mp4" },
        { kind: "HLS_PLAYLIST", objectKey: "hls/media/master.m3u8" },
      ]),
      { STORAGE_PUBLIC_URL: "https://media.example.com" },
    );
    const result = await service.getManifest("media");
    expect(result.sourceUrl).toBeUndefined();
    expect(result.masterPlaylistUrl).toBe("https://media.example.com/hls/media/master.m3u8");
  });
});
