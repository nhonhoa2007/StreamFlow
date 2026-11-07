import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlayerShell } from "./player-shell";
vi.mock("../lib/auth-context", () => ({ useAuth: () => ({ accessToken: null }) }));
vi.mock("../lib/playback-context", () => ({
  usePlayback: () => ({
    state: {
      currentItem: { id: "v", title: "Ocean", type: "VIDEO" },
      expanded: true,
      queue: [],
      revision: 1,
      status: "playing",
      positionMs: 1000,
      sessionId: null,
    },
    mediaRef: { current: null },
    flushRef: { current: null },
    dispatch: vi.fn(),
    notice: "Your progress couldn't be synced.",
    close: vi.fn(),
  }),
}));
describe("player feedback", () => {
  it("includes the progress-sync notice inside the modal content", () => {
    const markup = renderToStaticMarkup(createElement(PlayerShell));
    expect(markup).toContain("Your progress couldn&#x27;t be synced.");
  });
});
