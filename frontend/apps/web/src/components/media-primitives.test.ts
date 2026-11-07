import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaCard } from "./media-card";
import { formatMediaDuration, getArtworkTheme } from "./media-primitives";

describe("media primitives", () => {
  it("returns a deterministic artwork theme for the same title and type", () => {
    const first = getArtworkTheme("Ocean Signals", "VIDEO");
    const second = getArtworkTheme("Ocean Signals", "VIDEO");

    expect(first).toEqual(second);
    expect(first.from).toMatch(/^#/);
    expect(first.to).toMatch(/^#/);
  });

  it("uses an audio theme distinct from video", () => {
    expect(getArtworkTheme("Ocean Signals", "AUDIO")).not.toEqual(
      getArtworkTheme("Ocean Signals", "VIDEO"),
    );
  });

  it("formats media durations for editorial labels", () => {
    expect(formatMediaDuration(null)).toBe("Unknown duration");
    expect(formatMediaDuration(0)).toBe("Unknown duration");
    expect(formatMediaDuration(125000)).toBe("2m 05s");
    expect(formatMediaDuration(3723000)).toBe("1h 02m");
  });

  it("renders the first three classification labels and an accessible overflow count", () => {
    const html = renderToStaticMarkup(
      createElement(MediaCard, {
        item: {
          id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          type: "VIDEO",
          title: "Ocean Signals",
          slug: "ocean-signals",
          durationMs: 125000,
          classificationLabels: ["documentary", "nature", "ocean", "long-form"],
        },
      }),
    );

    expect(html).toContain("documentary");
    expect(html).toContain("nature");
    expect(html).toContain("ocean");
    expect(html).not.toContain("long-form");
    expect(html).toContain("+1 more classification");
    expect(html).toContain('aria-label="1 more classification"');
  });

  it("renders media cards without labels when classification is absent", () => {
    const html = renderToStaticMarkup(
      createElement(MediaCard, {
        item: {
          id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          type: "VIDEO",
          title: "Ocean Signals",
          slug: "ocean-signals",
          durationMs: null,
          classificationLabels: undefined as unknown as string[],
        },
      }),
    );

    expect(html).toContain("Ocean Signals");
    expect(html).not.toContain("more classification");
  });
});
