import type { DatabaseHandle } from "@streamflow/database";
import { searchMedia } from "@streamflow/database";
import { describe, expect, it, vi } from "vitest";
import type { CacheService } from "../cache/cache.service.js";
import { MediaService } from "./media.service.js";
vi.mock("@streamflow/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@streamflow/database")>()),
  searchMedia: vi.fn(),
}));
describe("paginated search responses", () => {
  it("returns the continuation cursor rather than marking every search as complete", async () => {
    vi.mocked(searchMedia).mockResolvedValueOnce({
      items: [],
      nextCursor: "second-page",
      hasMore: true,
    });
    const service = new MediaService({ db: {} } as DatabaseHandle, {} as CacheService);
    await expect(service.search({ q: "Ocean", cursor: "first-page" })).resolves.toEqual({
      items: [],
      nextCursor: "second-page",
      hasMore: true,
    });
  });
});
