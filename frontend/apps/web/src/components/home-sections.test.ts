import { describe, expect, it } from "vitest";
import { buildHomeSections } from "./home-content";
const video = {
  id: "v",
  title: "Ocean",
  type: "VIDEO" as const,
  slug: "ocean",
  durationMs: 1,
  classificationLabels: [],
};
const audio = { ...video, id: "a", type: "AUDIO" as const };
describe("editorial Home", () => {
  it("selects a video feature and groups real catalog items", () => {
    const sections = buildHomeSections([audio, video]);
    expect(sections.featured).toEqual(video);
    expect(sections.videos).toEqual([video]);
    expect(sections.audio).toEqual([audio]);
    expect(sections.recent).toEqual([audio, video]);
  });
  it("handles an empty catalog and an audio-only catalog", () => {
    expect(buildHomeSections([]).featured).toBeUndefined();
    expect(buildHomeSections([audio]).featured).toEqual(audio);
  });
});
