import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeUpload,
  fetchContinueWatching,
  fetchMedia,
  initUpload,
  toggleFavorite,
} from "./media-api";

describe("fetchMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed paginated data when API response is valid", async () => {
    const mockItems = [
      {
        id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        type: "VIDEO" as const,
        title: "Nature Documentary",
        slug: "nature-documentary",
        durationMs: 300000,
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: mockItems,
          nextCursor: "cursor_xyz",
          hasMore: true,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await fetchMedia("http://localhost:3000", {
      cursor: "prev_cursor",
      type: "VIDEO",
      limit: 10,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/v1/media?cursor=prev_cursor&type=VIDEO&limit=10",
      expect.any(Object),
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.nextCursor).toBe("cursor_xyz");
    expect(result.data?.hasMore).toBe(true);
  });

  it("handles empty items array gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await fetchMedia("http://localhost:3000");
    expect(result.error).toBeUndefined();
    expect(result.data?.items).toEqual([]);
    expect(result.data?.hasMore).toBe(false);
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

describe("fetchContinueWatching", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns continue watching items when authenticated", async () => {
    const mockContinueItems = [
      {
        mediaId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        positionMs: 45000,
        updatedAt: new Date().toISOString(),
        media: {
          id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          type: "VIDEO" as const,
          title: "Watched Movie",
          slug: "watched-movie",
          durationMs: 720000,
        },
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: mockContinueItems }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchContinueWatching("sample-jwt-token", "http://localhost:3000");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].positionMs).toBe(45000);
    expect(result.items[0].media.title).toBe("Watched Movie");
  });

  it("returns empty array when unauthenticated or on error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    const result = await fetchContinueWatching(null, "http://localhost:3000");
    expect(result.items).toEqual([]);
  });
});

describe("toggleFavorite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST when adding favorite", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok", favorited: true }), {
        status: 200,
      }),
    );

    const res = await toggleFavorite("token", "media-id-1", false, "http://localhost:3000");
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3000/v1/media/media-id-1/favorite", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
      },
    });
    expect(res).toBe(true);
  });

  it("sends DELETE when removing favorite", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok", favorited: false }), {
        status: 200,
      }),
    );

    const res = await toggleFavorite("token", "media-id-1", true, "http://localhost:3000");
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3000/v1/media/media-id-1/favorite", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer token",
      },
    });
    expect(res).toBe(false);
  });
});

describe("initUpload & completeUpload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /v1/admin/uploads/init with bearer token and payload", async () => {
    const mockInitResp = {
      uploadId: "11111111-1111-1111-1111-111111111111",
      mediaId: "22222222-2222-2222-2222-222222222222",
      objectKey: "raw/key/video.mp4",
      presignedUrl: "https://r2.storage/upload",
      expiresAt: new Date().toISOString(),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockInitResp), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = {
      filename: "video.mp4",
      expectedSize: 1048576,
      mimeType: "video/mp4" as const,
      type: "VIDEO" as const,
      title: "Sample Video",
    };

    const res = await initUpload("admin-token", payload, "http://localhost:3000");
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3000/v1/admin/uploads/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify(payload),
    });
    expect(res.data?.uploadId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("calls /v1/admin/uploads/:id/complete with bearer token", async () => {
    const mockCompleteResp = {
      status: "UPLOADED" as const,
      mediaId: "22222222-2222-2222-2222-222222222222",
      assetId: "33333333-3333-3333-3333-333333333333",
      objectKey: "raw/key/video.mp4",
      sizeBytes: 1048576,
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockCompleteResp), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await completeUpload(
      "admin-token",
      "11111111-1111-1111-1111-111111111111",
      "http://localhost:3000",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/v1/admin/uploads/11111111-1111-1111-1111-111111111111/complete",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
        },
      },
    );
    expect(res.data?.status).toBe("UPLOADED");
  });
});
