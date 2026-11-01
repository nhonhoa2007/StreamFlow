import { type MediaListResponse, MediaListResponseSchema } from "@streamflow/contracts";

export interface FetchMediaResult {
  data?: MediaListResponse;
  error?: string;
}

export async function fetchMedia(baseUrl?: string): Promise<FetchMediaResult> {
  const apiHost = baseUrl || process.env.API_BASE_URL || "http://127.0.0.1:3000";
  const url = `${apiHost}/v1/media`;

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

    const parseResult = MediaListResponseSchema.safeParse(json);
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
