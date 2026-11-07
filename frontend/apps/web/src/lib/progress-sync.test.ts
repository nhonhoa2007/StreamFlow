import { describe, expect, it } from "vitest";
import { ProgressSync } from "./progress-sync";
describe("playback progress synchronization", () => {
  it("advances beyond an existing server sequence after a new playback session", async () => {
    const writes: { sequence: number; positionMs: number }[] = [];
    const sync = new ProgressSync(
      async (payload) => {
        writes.push(payload);
        return writes.length === 1
          ? { data: { status: "ignored", lastSequence: 50, positionMs: 10000 } }
          : {
              data: {
                status: "updated",
                lastSequence: payload.sequence,
                positionMs: payload.positionMs,
              },
            };
      },
      () => {},
    );
    await sync.push(22000);
    expect(writes).toEqual([
      { sequence: 1, positionMs: 22000 },
      { sequence: 51, positionMs: 22000 },
    ]);
  });
  it("serializes writes and coalesces the latest position during a slow request", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes: number[] = [];
    const sync = new ProgressSync(
      async (payload) => {
        writes.push(payload.positionMs);
        if (writes.length === 1) await gate;
        return {
          data: {
            status: "updated",
            lastSequence: payload.sequence,
            positionMs: payload.positionMs,
          },
        };
      },
      () => {},
    );
    const done = sync.push(1000);
    void sync.push(2000);
    void sync.push(3000);
    release();
    await done;
    expect(writes).toEqual([1000, 3000]);
  });
});
