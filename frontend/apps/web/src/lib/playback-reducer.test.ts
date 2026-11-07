import type { MediaItem } from "@streamflow/contracts";
import { describe, expect, it } from "vitest";
import { initialPlaybackState, playbackReducer } from "./playback-reducer";

const film: MediaItem = {
  id: "film",
  title: "Ocean depths",
  type: "VIDEO",
  slug: "ocean",
  durationMs: 120000,
  classificationLabels: [],
};
const audio: MediaItem = { ...film, id: "audio", type: "AUDIO", title: "Midnight echoes" };

describe("playbackReducer", () => {
  it("starts a new item with clean playback state and a resume position", () => {
    const state = playbackReducer(initialPlaybackState, {
      type: "PLAY",
      item: film,
      positionMs: 45000,
    });
    expect(state.currentItem).toEqual(film);
    expect(state.positionMs).toBe(45000);
    expect(state.status).toBe("loading");
    expect(state.expanded).toBe(true);
  });
  it("deduplicates the queue and does not enqueue the current item", () => {
    let state = playbackReducer(initialPlaybackState, { type: "PLAY", item: film });
    state = playbackReducer(state, { type: "ENQUEUE", item: audio });
    state = playbackReducer(state, { type: "ENQUEUE", item: audio });
    state = playbackReducer(state, { type: "ENQUEUE", item: film });
    expect(state.queue).toEqual([audio]);
    expect(playbackReducer(state, { type: "REMOVE", mediaId: "audio" }).queue).toEqual([]);
  });
  it("keeps progress and the item while minimizing, pausing, and reporting an error", () => {
    let state = playbackReducer(initialPlaybackState, { type: "PLAY", item: film });
    state = playbackReducer(state, { type: "PROGRESS", positionMs: 8000 });
    state = playbackReducer(state, { type: "STATUS", status: "paused" });
    state = playbackReducer(state, { type: "EXPAND", expanded: false });
    expect(state.currentItem).toEqual(film);
    expect(state.positionMs).toBe(8000);
    expect(state.status).toBe("paused");
    expect(state.expanded).toBe(false);
    state = playbackReducer(state, { type: "ERROR", error: "Try again" });
    expect(state.status).toBe("error");
    expect(playbackReducer(state, { type: "RETRY" }).error).toBeNull();
  });
  it("clears the current item on stop while preserving the queue", () => {
    const state = playbackReducer(
      { ...initialPlaybackState, currentItem: film, queue: [audio] },
      { type: "CLOSE" },
    );
    expect(state.currentItem).toBeNull();
    expect(state.queue).toEqual([audio]);
  });
  it("ignores late async session and error responses for an old selection", () => {
    const state = playbackReducer(initialPlaybackState, { type: "PLAY", item: audio });
    expect(
      playbackReducer(state, {
        type: "SESSION",
        mediaId: film.id,
        sessionId: "old",
        positionMs: 99,
      }),
    ).toEqual(state);
    expect(
      playbackReducer(state, { type: "ERROR", mediaId: film.id, error: "Old failure" }),
    ).toEqual(state);
  });
});

describe("server resume timing", () => {
  it("keeps playback pending until the authenticated resume position is resolved", () => {
    let state = playbackReducer(initialPlaybackState, {
      type: "PLAY",
      item: film,
      sessionPending: true,
    });
    expect(state.sessionPending).toBe(true);
    state = playbackReducer(state, {
      type: "SESSION",
      mediaId: film.id,
      sessionId: "s",
      positionMs: 60000,
    });
    expect(state.sessionPending).toBe(false);
    expect(state.positionMs).toBe(60000);
  });
  it("allows guest playback after a sync failure without losing the requested resume position", () => {
    let state = playbackReducer(initialPlaybackState, {
      type: "PLAY",
      item: film,
      positionMs: 20000,
      sessionPending: true,
    });
    state = playbackReducer(state, { type: "SESSION_UNAVAILABLE", mediaId: film.id });
    expect(state.sessionPending).toBe(false);
    expect(state.positionMs).toBe(20000);
  });
});
