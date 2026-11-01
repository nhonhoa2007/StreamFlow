import { type PaginatedMediaResponse, PaginatedMediaResponseSchema } from "@streamflow/contracts";

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
