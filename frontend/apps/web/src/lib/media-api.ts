import {
  type CompleteUploadResponse,
  CompleteUploadResponseSchema,
  type ContinueItem,
  ContinueWatchingResponseSchema,
  type InitUploadRequest,
  type InitUploadResponse,
  InitUploadResponseSchema,
  type PaginatedMediaResponse,
  PaginatedMediaResponseSchema,
} from "@streamflow/contracts";

export interface FetchMediaOptions {
  cursor?: string;
  type?: "AUDIO" | "VIDEO";
  limit?: number;
}

export interface FetchMediaResult {
  data?: PaginatedMediaResponse;
  error?: string;
}

export async function fetchMedia(
  baseUrl?: string,
  options?: FetchMediaOptions,
): Promise<FetchMediaResult> {
  const apiHost = baseUrl || process.env.API_BASE_URL || "http://127.0.0.1:3000";

  const searchParams = new URLSearchParams();
  if (options?.cursor) searchParams.set("cursor", options.cursor);
  if (options?.type) searchParams.set("type", options.type);
  if (options?.limit) searchParams.set("limit", String(options.limit));

  const qs = searchParams.toString();
  const url = `${apiHost}/v1/media${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        error: "Media service is currently unavailable. Please try again later.",
      };
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        error: "Received invalid data from media service.",
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

export async function fetchContinueWatching(
  token: string | null,
  baseUrl?: string,
): Promise<{ items: ContinueItem[] }> {
  if (!token) {
    return { items: [] };
  }

  const apiHost = baseUrl || process.env.API_BASE_URL || "http://127.0.0.1:3000";
  try {
    const res = await fetch(`${apiHost}/v1/library/continue`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return { items: [] };
    }

    const json = await res.json();
    const parsed = ContinueWatchingResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : { items: [] };
  } catch {
    return { items: [] };
  }
}

export async function toggleFavorite(
  token: string,
  mediaId: string,
  isFavorited: boolean,
  baseUrl?: string,
): Promise<boolean> {
  const apiHost = baseUrl || process.env.API_BASE_URL || "http://127.0.0.1:3000";
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
  const apiHost = baseUrl || process.env.API_BASE_URL || "http://127.0.0.1:3000";
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
  const apiHost = baseUrl || process.env.API_BASE_URL || "http://127.0.0.1:3000";
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
