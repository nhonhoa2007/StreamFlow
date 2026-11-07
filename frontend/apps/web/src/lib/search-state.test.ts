import { describe, expect, it } from "vitest";
import { readSearchState, searchHref } from "./search-state";
describe("search URL state", () => {
  it("normalizes optional query and rejects unknown types", () => {
    expect(
      readSearchState({ q: " ocean ", type: "VIDEO", classification: "nature-documentary" }),
    ).toEqual({
      query: "ocean",
      type: "VIDEO",
      classification: "nature-documentary",
    });
    expect(
      readSearchState({ q: ["one", "two"], type: "invalid", classification: "Bad Label" }),
    ).toEqual({
      query: "one",
      type: undefined,
    });
    expect(readSearchState({ classification: ["nature-documentary", "other"] })).toEqual({
      query: "",
      type: undefined,
    });
  });
  it("keeps filter state when query is empty and encodes a shareable URL", () => {
    expect(searchHref(" ", "AUDIO")).toBe("/search?type=AUDIO");
    expect(searchHref("ocean & sky", "VIDEO", "nature-documentary")).toBe(
      "/search?q=ocean+%26+sky&type=VIDEO&classification=nature-documentary",
    );
    expect(searchHref("ocean", undefined, "Bad Label")).toBe("/search?q=ocean");
    expect(searchHref("")).toBe("/search");
  });

  it("serializes sort, duration, and publication bounds", () => {
    expect(
      searchHref(
        "ocean",
        "VIDEO",
        undefined,
        "title_asc",
        60000,
        300000,
        "2026-01-01",
        "2026-12-31",
      ),
    ).toBe(
      "/search?q=ocean&type=VIDEO&sort=title_asc&minDurationMs=60000&maxDurationMs=300000&publishedAfter=2026-01-01&publishedBefore=2026-12-31",
    );
    expect(
      readSearchState({ sort: "title_asc", minDurationMs: "60000", maxDurationMs: "300000" }),
    ).toMatchObject({
      sort: "title_asc",
      minDurationMs: 60000,
      maxDurationMs: 300000,
    });
  });
});
