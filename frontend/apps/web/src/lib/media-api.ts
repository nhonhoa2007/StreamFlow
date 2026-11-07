import {
  type CompleteUploadResponse,
  CompleteUploadResponseSchema,
  type ContinueItem,
  ContinueWatchingResponseSchema,
  type FavoriteItem,
  FavoriteListResponseSchema,
  type InitUploadRequest,
  type InitUploadResponse,
  InitUploadResponseSchema,
  type MediaDetail,
  MediaDetailSchema,
  type PaginatedMediaResponse,
  PaginatedMediaResponseSchema,
  type PlaybackManifestResponse,
  PlaybackManifestResponseSchema,
  type PlaylistDetail,
  PlaylistDetailSchema,
  type PlaylistSummary,
  PlaylistSummarySchema,
  type ProgressResponse,
  ProgressResponseSchema,
  type StartPlaybackResponse,
  StartPlaybackResponseSchema,
  type UpdateProgress,
  type UserSummary,
  UserSummarySchema,
} from "@streamflow/contracts";

export interface FetchMediaOptions {
  cursor?: string;
  type?: "AUDIO" | "VIDEO";
  classification?: string;
  limit?: number;
  signal?: AbortSignal;
  sort?: "recent" | "title_asc";
  minDurationMs?: number;
  maxDurationMs?: number;
  publishedAfter?: string;
  publishedBefore?: string;
}

export interface FetchMediaResult {
  data?: PaginatedMediaResponse;
  error?: string;
}

const unavailableError = "Media service is currently unavailable. Please try again later.";
const invalidDataError = "Received invalid data from media service.";

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return JSON.parse(text) as unknown;
}

export async function fetchCurrentUser(
  token: string,
  baseUrl?: string,
): Promise<{ data?: UserSummary; error?: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl(baseUrl)}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return { error: "Your profile is currently unavailable." };
    const parsed = UserSummarySchema.safeParse(await readJson(response));
    return parsed.success ? { data: parsed.data } : { error: invalidDataError };
  } catch {
    return { error: "Your profile is currently unavailable." };
  }
}

export function getApiBaseUrl(baseUrl?: string): string {
  return (
    baseUrl ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.API_BASE_URL ||
    "http://127.0.0.1:3000"
  );
}

export async function fetchMedia(
  baseUrl?: string,
  options?: FetchMediaOptions,
): Promise<FetchMediaResult> {
  const apiHost = getApiBaseUrl(baseUrl);

  const searchParams = new URLSearchParams();
  if (options?.cursor) searchParams.set("cursor", options.cursor);
  if (options?.type) searchParams.set("type", options.type);
  if (options?.classification) searchParams.set("classification", options.classification);
  if (options?.limit) searchParams.set("limit", String(options.limit));
  if (options?.sort) searchParams.set("sort", options.sort);
  if (options?.minDurationMs !== undefined)
    searchParams.set("minDurationMs", String(options.minDurationMs));
  if (options?.maxDurationMs !== undefined)
    searchParams.set("maxDurationMs", String(options.maxDurationMs));
  if (options?.publishedAfter) searchParams.set("publishedAfter", options.publishedAfter);
  if (options?.publishedBefore) searchParams.set("publishedBefore", options.publishedBefore);

  const qs = searchParams.toString();
  const url = `${apiHost}/v1/media${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!res.ok) {
      return {
        error: unavailableError,
      };
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        error: invalidDataError,
      };
    }

    const parseResult = PaginatedMediaResponseSchema.safeParse(json);
    if (!parseResult.success) {
      return {
        error: "Received invalid data structure from media service.",
      };
    }

    return {
      data: parseResult.data,
    };
  } catch (_err) {
    return {
      error: "Media service is currently unavailable. Please try again later.",
    };
  }
}

export async function searchMedia(
  query: string,
  type?: "AUDIO" | "VIDEO",
  baseUrl?: string,
  options?: Pick<
    FetchMediaOptions,
    | "cursor"
    | "classification"
    | "limit"
    | "signal"
    | "sort"
    | "minDurationMs"
    | "maxDurationMs"
    | "publishedAfter"
    | "publishedBefore"
  >,
): Promise<FetchMediaResult> {
  const apiHost = getApiBaseUrl(baseUrl);
  const searchParams = new URLSearchParams({ q: query });
  if (type) searchParams.set("type", type);
  if (options?.cursor) searchParams.set("cursor", options.cursor);
  if (options?.classification) searchParams.set("classification", options.classification);
  if (options?.limit) searchParams.set("limit", String(options.limit));
  if (options?.sort) searchParams.set("sort", options.sort);
  if (options?.minDurationMs !== undefined)
    searchParams.set("minDurationMs", String(options.minDurationMs));
  if (options?.maxDurationMs !== undefined)
    searchParams.set("maxDurationMs", String(options.maxDurationMs));
  if (options?.publishedAfter) searchParams.set("publishedAfter", options.publishedAfter);
  if (options?.publishedBefore) searchParams.set("publishedBefore", options.publishedBefore);

  try {
    const res = await fetch(`${apiHost}/v1/search?${searchParams.toString()}`, {
      cache: "no-store",
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    if (!res.ok) return { error: unavailableError };
    const parsed = PaginatedMediaResponseSchema.safeParse(await readJson(res));
    return parsed.success ? { data: parsed.data } : { error: invalidDataError };
  } catch {
    return { error: unavailableError };
  }
}

export async function fetchMediaDetail(
  mediaId: string,
  baseUrl?: string,
): Promise<{ data?: MediaDetail; error?: string }> {
  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(`${apiHost}/v1/media/${encodeURIComponent(mediaId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return { error: "Media details are currently unavailable." };
    const parsed = MediaDetailSchema.safeParse(await readJson(res));
    return parsed.success ? { data: parsed.data } : { error: invalidDataError };
  } catch {
    return { error: "Media details are currently unavailable." };
  }
}

export async function fetchContinueWatching(
  token: string | null,
  baseUrl?: string,
): Promise<{ items: ContinueItem[]; error?: string }> {
  if (!token) {
    return { items: [] };
  }

  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(`${apiHost}/v1/library/continue`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return { items: [], error: "Your listening history is currently unavailable." };
    }

    const json = await res.json();
    const parsed = ContinueWatchingResponseSchema.safeParse(json);
    return parsed.success
      ? parsed.data
      : { items: [], error: "Your listening history is currently unavailable." };
  } catch {
    return { items: [], error: "Your listening history is currently unavailable." };
  }
}

type PlaylistRequestResult<T> = { data?: T; error?: string; status?: number };

async function playlistRequest<T>(
  token: string,
  path: string,
  init: RequestInit,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  baseUrl?: string,
): Promise<PlaylistRequestResult<T>> {
  try {
    const response = await fetch(`${getApiBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const json = await response.json().catch(() => undefined);
    if (!response.ok) {
      return {
        status: response.status,
        error:
          typeof json === "object" && json && "message" in json
            ? String((json as { message?: unknown }).message)
            : "Request failed",
      };
    }
    const parsed = schema.safeParse(json);
    return parsed.success
      ? { data: parsed.data, status: response.status }
      : { error: invalidDataError, status: response.status };
  } catch {
    return { error: "Network error. Please try again." };
  }
}

export async function fetchPlaylists(
  token: string,
  baseUrl?: string,
): Promise<PlaylistRequestResult<PlaylistSummary[]>> {
  return playlistRequest(
    token,
    "/v1/playlists",
    { method: "GET" },
    {
      safeParse(value) {
        if (!Array.isArray(value)) return { success: false };
        const items = value.map((item) => PlaylistSummarySchema.safeParse(item));
        return items.every((item) => item.success)
          ? { success: true, data: items.map((item) => item.data as PlaylistSummary) }
          : { success: false };
      },
    },
    baseUrl,
  );
}

export function createPlaylist(
  token: string,
  payload: { name: string; description?: string },
  baseUrl?: string,
) {
  return playlistRequest<PlaylistSummary>(
    token,
    "/v1/playlists",
    { method: "POST", body: JSON.stringify(payload) },
    PlaylistSummarySchema,
    baseUrl,
  );
}

export function updatePlaylist(
  token: string,
  playlistId: string,
  payload: { name?: string; description?: string },
  baseUrl?: string,
) {
  return playlistRequest<PlaylistSummary>(
    token,
    `/v1/playlists/${encodeURIComponent(playlistId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    PlaylistSummarySchema,
    baseUrl,
  );
}

export function deletePlaylist(token: string, playlistId: string, baseUrl?: string) {
  return playlistRequest<{ status: string }>(
    token,
    `/v1/playlists/${encodeURIComponent(playlistId)}`,
    { method: "DELETE" },
    {
      safeParse: (value) => ({
        success: Boolean(value && typeof value === "object"),
        data: value as { status: string },
      }),
    },
    baseUrl,
  );
}

export function fetchPlaylistDetail(token: string, playlistId: string, baseUrl?: string) {
  return playlistRequest<PlaylistDetail>(
    token,
    `/v1/playlists/${encodeURIComponent(playlistId)}`,
    { method: "GET" },
    PlaylistDetailSchema,
    baseUrl,
  );
}

export function addPlaylistItem(
  token: string,
  playlistId: string,
  mediaId: string,
  baseUrl?: string,
) {
  return playlistRequest<unknown>(
    token,
    `/v1/playlists/${encodeURIComponent(playlistId)}/items`,
    { method: "POST", body: JSON.stringify({ mediaId }) },
    { safeParse: (value) => ({ success: Boolean(value), data: value }) },
    baseUrl,
  );
}

export function removePlaylistItem(
  token: string,
  playlistId: string,
  itemId: string,
  baseUrl?: string,
) {
  return playlistRequest<{ status: string }>(
    token,
    `/v1/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
    {
      safeParse: (value) => ({
        success: Boolean(value && typeof value === "object"),
        data: value as { status: string },
      }),
    },
    baseUrl,
  );
}

export function reorderPlaylistItems(
  token: string,
  playlistId: string,
  expectedVersion: number,
  itemIds: string[],
  baseUrl?: string,
) {
  return playlistRequest<{ newVersion: number }>(
    token,
    `/v1/playlists/${encodeURIComponent(playlistId)}/items/reorder`,
    { method: "PATCH", body: JSON.stringify({ expectedVersion, itemIds }) },
    {
      safeParse: (value) => ({
        success: Boolean(value && typeof value === "object"),
        data: value as { newVersion: number },
      }),
    },
    baseUrl,
  );
}

export async function fetchHistory(
  token: string | null,
  baseUrl?: string,
): Promise<{ items: ContinueItem[]; error?: string }> {
  if (!token) return { items: [] };
  const result = await playlistRequest<{ items: ContinueItem[] }>(
    token,
    "/v1/library/history",
    { method: "GET" },
    ContinueWatchingResponseSchema,
    baseUrl,
  );
  return result.data ?? { items: [], error: result.error };
}

export async function fetchFavorites(
  token: string,
  baseUrl?: string,
): Promise<{ items: FavoriteItem[]; error?: string }> {
  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(`${apiHost}/v1/library/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { items: [], error: "Your library is currently unavailable." };
    const parsed = FavoriteListResponseSchema.safeParse(await readJson(res));
    return parsed.success
      ? parsed.data
      : { items: [], error: "Your library is currently unavailable." };
  } catch {
    return { items: [], error: "Your library is currently unavailable." };
  }
}

export async function startPlayback(
  token: string,
  mediaId: string,
  baseUrl?: string,
): Promise<{ data?: StartPlaybackResponse; error?: string }> {
  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(`${apiHost}/v1/playback/${encodeURIComponent(mediaId)}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: "Unable to start playback." };
    const parsed = StartPlaybackResponseSchema.safeParse(await readJson(res));
    return parsed.success ? { data: parsed.data } : { error: invalidDataError };
  } catch {
    return { error: "Unable to start playback." };
  }
}

export async function updatePlaybackProgress(
  token: string,
  sessionId: string,
  payload: UpdateProgress,
  baseUrl?: string,
): Promise<{ data?: ProgressResponse; error?: string }> {
  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(
      `${apiHost}/v1/playback/sessions/${encodeURIComponent(sessionId)}/progress`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) return { error: "Unable to save playback progress." };
    const parsed = ProgressResponseSchema.safeParse(await readJson(res));
    return parsed.success ? { data: parsed.data } : { error: invalidDataError };
  } catch {
    return { error: "Unable to save playback progress." };
  }
}

export async function toggleFavorite(
  token: string,
  mediaId: string,
  isFavorited: boolean,
  baseUrl?: string,
): Promise<boolean> {
  const apiHost = getApiBaseUrl(baseUrl);
  const method = isFavorited ? "DELETE" : "POST";

  try {
    const res = await fetch(`${apiHost}/v1/media/${mediaId}/favorite`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return isFavorited;
    }

    const data = await res.json();
    return Boolean(data.favorited);
  } catch {
    return isFavorited;
  }
}

export async function initUpload(
  token: string,
  payload: InitUploadRequest,
  baseUrl?: string,
): Promise<{ data?: InitUploadResponse; error?: string }> {
  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(`${apiHost}/v1/admin/uploads/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      return { error: json.message || "Failed to initialize upload" };
    }

    const parsed = InitUploadResponseSchema.safeParse(json);
    return parsed.success ? { data: parsed.data } : { error: "Invalid upload init response" };
  } catch {
    return { error: "Network error during upload initialization" };
  }
}

export async function completeUpload(
  token: string,
  uploadId: string,
  baseUrl?: string,
): Promise<{ data?: CompleteUploadResponse; error?: string }> {
  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(`${apiHost}/v1/admin/uploads/${uploadId}/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();
    if (!res.ok) {
      return { error: json.message || "Failed to complete upload" };
    }

    const parsed = CompleteUploadResponseSchema.safeParse(json);
    return parsed.success ? { data: parsed.data } : { error: "Invalid upload complete response" };
  } catch {
    return { error: "Network error during upload completion" };
  }
}

export async function fetchPlaybackManifest(
  mediaId: string,
  baseUrl?: string,
): Promise<{ data?: PlaybackManifestResponse; error?: string }> {
  const apiHost = getApiBaseUrl(baseUrl);
  try {
    const res = await fetch(`${apiHost}/v1/playback/${mediaId}/manifest`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return { error: "Playback manifest not available" };
    }

    const json = await res.json();
    const parsed = PlaybackManifestResponseSchema.safeParse(json);
    return parsed.success ? { data: parsed.data } : { error: "Invalid manifest response format" };
  } catch {
    return { error: "Network error fetching playback manifest" };
  }
}
