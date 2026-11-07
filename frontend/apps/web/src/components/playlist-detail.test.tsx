import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlaylistDetail } from "./playlist-detail";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ accessToken: null }),
}));

describe("playlist detail access", () => {
  it("requires authentication before rendering playlist contents", () => {
    const html = renderToStaticMarkup(createElement(PlaylistDetail, { id: "playlist-1" }));
    expect(html).toContain("Please sign in to view this playlist.");
  });
});
