import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAdminMedia, updateAdminMedia } from "./admin-api";

afterEach(() => vi.restoreAllMocks());
const media = {
  id: "11111111-1111-1111-1111-111111111111",
  type: "VIDEO",
  title: "Film",
  slug: "film",
  durationMs: null,
  status: "DRAFT",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
describe("admin api", () => {
  it("lists media with the admin bearer token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([media]), { status: 200 }));
    const result = await fetchAdminMedia("token", "http://api");
    expect(result.data?.[0].slug).toBe("film");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api/v1/admin/media",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });
  it("returns structured validation errors", async () => {
    const result = await updateAdminMedia("token", media.id, { durationMs: -1 }, "http://api");
    expect(result.error).toBe("Invalid media update.");
  });
});
