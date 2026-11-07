import {
  type AdminMediaListResponse,
  AdminMediaListResponseSchema,
  type AdminMediaRecord,
  AdminMediaRecordSchema,
  AdminTranscodeJobsResponseSchema,
  type AdminUpdateMedia,
  AdminUpdateMediaSchema,
  type TranscodeJobStatusResponse,
  TranscodeJobStatusResponseSchema,
} from "@streamflow/contracts";
import { getApiBaseUrl } from "./media-api";

export type AdminResult<T> = { data?: T; error?: string; status?: number };
const unavailable = "Admin service is currently unavailable. Please try again later.";

async function request<T>(
  token: string,
  path: string,
  init: RequestInit,
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  baseUrl?: string,
): Promise<AdminResult<T>> {
  try {
    const response = await fetch(`${getApiBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body
          ? String((body as { message?: unknown }).message)
          : unavailable;
      return { error: message, status: response.status };
    }
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { data: parsed.data, status: response.status }
      : { error: "Received invalid admin data.", status: response.status };
  } catch {
    return { error: unavailable };
  }
}

export function fetchAdminMedia(
  token: string,
  baseUrl?: string,
): Promise<AdminResult<AdminMediaListResponse>> {
  return request(
    token,
    "/v1/admin/media",
    { method: "GET" },
    AdminMediaListResponseSchema,
    baseUrl,
  );
}

export function updateAdminMedia(
  token: string,
  id: string,
  payload: AdminUpdateMedia,
  baseUrl?: string,
): Promise<AdminResult<AdminMediaRecord>> {
  const valid = AdminUpdateMediaSchema.safeParse(payload);
  if (!valid.success) return Promise.resolve({ error: "Invalid media update." });
  return request(
    token,
    `/v1/admin/media/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(valid.data) },
    AdminMediaRecordSchema,
    baseUrl,
  );
}

export function deleteAdminMedia(
  token: string,
  id: string,
  baseUrl?: string,
): Promise<AdminResult<{ status: string }>> {
  return request(
    token,
    `/v1/admin/media/${encodeURIComponent(id)}`,
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

export function triggerAdminTranscode(
  token: string,
  id: string,
  baseUrl?: string,
): Promise<AdminResult<{ jobId: string; status: string }>> {
  return request(
    token,
    `/v1/admin/media/${encodeURIComponent(id)}/transcode`,
    { method: "POST" },
    {
      safeParse: (value) => ({
        success: Boolean(value && typeof value === "object" && "jobId" in value),
        data: value as { jobId: string; status: string },
      }),
    },
    baseUrl,
  );
}

export function fetchAdminTranscodeJobs(
  token: string,
  mediaId: string,
  baseUrl?: string,
): Promise<AdminResult<TranscodeJobStatusResponse[]>> {
  return request(
    token,
    `/v1/admin/media/${encodeURIComponent(mediaId)}/transcode-jobs`,
    { method: "GET" },
    AdminTranscodeJobsResponseSchema,
    baseUrl,
  );
}

export function fetchAdminJobStatus(
  token: string,
  jobId: string,
  baseUrl?: string,
): Promise<AdminResult<TranscodeJobStatusResponse>> {
  return request(
    token,
    `/v1/admin/transcode-jobs/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    TranscodeJobStatusResponseSchema,
    baseUrl,
  );
}
