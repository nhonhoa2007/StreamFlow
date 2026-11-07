import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeUpload,
  createPlaylist,
  deletePlaylist,
  fetchContinueWatching,
  fetchFavorites,
  fetchHistory,
  fetchMedia,
  fetchMediaDetail,
  fetchPlaybackManifest,
  fetchPlaylists,
  getApiBaseUrl,
  initUpload,
  reorderPlaylistItems,
  searchMedia,
  startPlayback,
  toggleFavorite,
  updatePlaybackProgress,
  updatePlaylist,
} from "./media-api";

describe("getApiBaseUrl", () => {
  it("uses the browser-exposed API base URL when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.streamflow.example");
    expect(getApiBaseUrl()).toBe("https://api.streamflow.example");
    vi.unstubAllEnvs();
  });
});

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
      classification: "nature-documentary",
      limit: 10,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/v1/media?cursor=prev_cursor&type=VIDEO&classification=nature-documentary&limit=10",
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

describe("searchMedia and fetchMediaDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encodes the search query and optional type filter", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null, hasMore: false }), {
        status: 200,
      }),
    );

    await searchMedia("nature & sound", "AUDIO", "http://localhost:3000", {
      classification: "field-recording",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/v1/search?q=nature+%26+sound&type=AUDIO&classification=field-recording",
      expect.any(Object),
    );
  });

  it("retains classification on search cursor requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null, hasMore: false }), {
        status: 200,
      }),
    );

    await searchMedia("nature", undefined, "http://localhost:3000", {
      cursor: "next-page",
      classification: "field-recording",
      limit: 20,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/v1/search?q=nature&cursor=next-page&classification=field-recording&limit=20",
      expect.any(Object),
    );
  });

  it("parses media details and returns a safe error for invalid detail data", async () => {
    const detail = {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      type: "VIDEO",
      title: "Nature Documentary",
      slug: "nature-documentary",
      durationMs: 300000,
      album: null,
      artists: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(detail), { status: 200 }),
    );

    const result = await fetchMediaDetail(detail.id, "http://localhost:3000");
    expect(result.data?.title).toBe("Nature Documentary");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    const invalid = await fetchMediaDetail(detail.id, "http://localhost:3000");
    expect(invalid.data).toBeUndefined();
    expect(invalid.error).toMatch(/invalid/i);
  });
});

describe("authenticated library and playback helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches favorites with a bearer token", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    const result = await fetchFavorites("session-token", "http://localhost:3000");
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3000/v1/library/favorites", {
      headers: { Authorization: "Bearer session-token" },
      cache: "no-store",
    });
    expect(result.items).toEqual([]);
  });

  it("starts playback and updates progress with authenticated request bodies", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "11111111-1111-1111-1111-111111111111",
            mediaId: "22222222-2222-2222-2222-222222222222",
            positionMs: 0,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "updated", positionMs: 1200, lastSequence: 1 }), {
          status: 200,
        }),
      );

    await startPlayback(
      "session-token",
      "22222222-2222-2222-2222-222222222222",
      "http://localhost:3000",
    );
    await updatePlaybackProgress(
      "session-token",
      "11111111-1111-1111-1111-111111111111",
      { sequence: 1, positionMs: 1200 },
      "http://localhost:3000",
    );

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3000/v1/playback/22222222-2222-2222-2222-222222222222/start",
      {
        method: "POST",
        headers: { Authorization: "Bearer session-token" },
      },
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/v1/playback/sessions/11111111-1111-1111-1111-111111111111/progress",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer session-token",
        },
        body: JSON.stringify({ sequence: 1, positionMs: 1200 }),
      },
    );
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

describe("fetchPlaybackManifest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches playback manifest for media id", async () => {
    const mockManifest = {
      mediaId: "22222222-2222-2222-2222-222222222222",
      type: "VIDEO" as const,
      title: "Stream Film",
      masterPlaylistUrl: "http://localhost:9000/streamflow-media-dev/hls/m1/master.m3u8",
      thumbnailUrl: "http://localhost:9000/streamflow-media-dev/thumbnails/m1/poster.jpg",
      renditions: [
        {
          name: "720p",
          width: 1280,
          height: 720,
          videoBitrateKbps: 2200,
          audioBitrateKbps: 128,
          playlistKey: "hls/m1/720p.m3u8",
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockManifest), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await fetchPlaybackManifest(
      "22222222-2222-2222-2222-222222222222",
      "http://localhost:3000",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/v1/playback/22222222-2222-2222-2222-222222222222/manifest",
      expect.any(Object),
    );
    expect(res.data?.masterPlaylistUrl).toContain("master.m3u8");
    expect(res.data?.renditions).toHaveLength(1);
  });
});

describe("library failures", () => {
  afterEach(() => vi.restoreAllMocks());
  it("distinguishes a failed favorites request from an empty library", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("secret infrastructure error", { status: 503 }),
    );
    const result = await fetchFavorites("token", "http://localhost:3000");
    expect(result.items).toEqual([]);
    expect(result.error).toMatch(/unavailable/i);
    expect(result.error).not.toContain("secret");
  });
});

describe("playlist API", () => {
  afterEach(() => vi.restoreAllMocks());

  const playlist = {
    id: "11111111-1111-1111-1111-111111111111",
    ownerId: "22222222-2222-2222-2222-222222222222",
    name: "Focus",
    description: null,
    version: 1,
    itemCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("sends authenticated playlist CRUD requests", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(playlist), { status: 200 }));
    await fetchPlaylists("token", "http://localhost:3000");
    await createPlaylist("token", { name: "Focus" }, "http://localhost:3000");
    await updatePlaylist("token", playlist.id, { name: "Updated" }, "http://localhost:3000");
    await deletePlaylist("token", playlist.id, "http://localhost:3000");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/v1/playlists",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(fetchSpy.mock.calls[2]?.[0]).toContain(`/v1/playlists/${playlist.id}`);
  });

  it("surfaces a reorder conflict and validates history responses", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "conflict" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const reorder = await reorderPlaylistItems(
      "token",
      playlist.id,
      1,
      [],
      "http://localhost:3000",
    );
    expect(reorder.status).toBe(409);
    const history = await fetchHistory("token", "http://localhost:3000");
    expect(history.items).toEqual([]);
  });
});

describe("infinite loading requests", () => {
  afterEach(() => vi.restoreAllMocks());
  it("keeps the search query and type while requesting the next cursor", async () => {
    const requested: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ items: [], nextCursor: null, hasMore: false }), {
        status: 200,
      });
    });
    await searchMedia("ocean & sky", "VIDEO", "http://localhost:3000", {
      cursor: "page+/=",
      limit: 20,
    });
    expect(requested).toEqual([
      "http://localhost:3000/v1/search?q=ocean+%26+sky&type=VIDEO&cursor=page%2B%2F%3D&limit=20",
    ]);
  });

  it("serializes search bounds without dropping the cursor", async () => {
    const requested: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ items: [], nextCursor: null, hasMore: false }), {
        status: 200,
      });
    });
    await searchMedia("ocean", "VIDEO", "http://localhost:3000", {
      cursor: "next-page",
      sort: "title_asc",
      minDurationMs: 60000,
      maxDurationMs: 300000,
      publishedAfter: "2026-01-01",
      publishedBefore: "2026-12-31",
    });
    expect(requested[0]).toContain("cursor=next-page");
    expect(requested[0]).toContain("sort=title_asc");
    expect(requested[0]).toContain("minDurationMs=60000");
    expect(requested[0]).toContain("publishedBefore=2026-12-31");
  });
  it("passes cancellation to the catalog request when its list unmounts", async () => {
    const controller = new AbortController();
    let signal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, options) => {
      signal = options?.signal;
      return new Response(JSON.stringify({ items: [], nextCursor: null, hasMore: false }), {
        status: 200,
      });
    });
    await fetchMedia("http://localhost:3000", { cursor: "p2", signal: controller.signal });
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });
});
