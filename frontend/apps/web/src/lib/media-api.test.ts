import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMedia } from "./media-api";

describe("fetchMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed data when API response is valid", async () => {
    const mockItems = [
      {
        id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        type: "VIDEO" as const,
        title: "Nature Documentary",
        slug: "nature-documentary",
        durationMs: 300000,
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: mockItems }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchMedia("http://localhost:3000");
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.items[0].slug).toBe("nature-documentary");
  });

  it("handles empty items array gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchMedia("http://localhost:3000");
    expect(result.error).toBeUndefined();
    expect(result.data?.items).toEqual([]);
  });

  it("returns safe error when API responds with 503 or 500 error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 503,
          message: "Database connection failed at postgres://user:pass@secret:5432",
        }),
        { status: 503 },
      ),
    );

    const result = await fetchMedia("http://localhost:3000");
    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain("secret");
    expect(result.error).not.toContain("postgres");
    expect(result.error).toMatch(/unavailable/i);
  });

  it("returns safe error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:3000"),
    );

    const result = await fetchMedia("http://localhost:3000");
    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/unavailable/i);
  });

  it("returns safe error when response is invalid JSON or violates schema", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Invalid raw HTML or malformed string", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await fetchMedia("http://localhost:3000");
    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/invalid/i);
  });
});
