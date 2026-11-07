import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlaybackProvider, usePlayback } from "./playback-context";
vi.mock("./auth-context", () => ({ useAuth: () => ({ accessToken: null }) }));
const item = {
  id: "v",
  title: "Ocean",
  slug: "ocean",
  type: "VIDEO" as const,
  durationMs: 10000,
  classificationLabels: [],
};
describe("playback transitions", () => {
  it("flushes progress at both the stop and title-switch boundaries", async () => {
    let context: ReturnType<typeof usePlayback> | undefined;
    function Probe() {
      context = usePlayback();
      return null;
    }
    renderToStaticMarkup(createElement(PlaybackProvider, null, createElement(Probe)));
    if (!context) throw new Error("Missing context");
    let saved = 0;
    context.flushRef.current = () => {
      saved++;
    };
    await context.play(item);
    expect(saved).toBe(1);
    context.close();
    expect(saved).toBe(2);
  });
});
