import { describe, expect, it, vi } from "vitest";
import { fetchMedia } from "../lib/media-api";
import HomePage from "./page";
vi.mock("../lib/media-api", () => ({ fetchMedia: vi.fn() }));
describe("Home recovery", () => {
  it("resets the client catalog when a server retry recovers new data", async () => {
    vi.mocked(fetchMedia).mockResolvedValueOnce({ error: "Unavailable" });
    const failed = await HomePage();
    vi.mocked(fetchMedia).mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "v",
            title: "Ocean",
            slug: "ocean",
            type: "VIDEO",
            durationMs: 12000,
            classificationLabels: [],
          },
        ],
        hasMore: false,
        nextCursor: null,
      },
    });
    const recovered = await HomePage();
    expect(recovered.key).not.toBe(failed.key);
    expect(recovered.props.initialItems).toHaveLength(1);
  });
});
