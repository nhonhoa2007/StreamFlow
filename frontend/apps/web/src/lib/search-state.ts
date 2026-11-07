import { ClassificationLabelSchema } from "@streamflow/contracts";

export type MediaFilter = "VIDEO" | "AUDIO";
export type ClassificationFilter = string;
export type SearchSort = "recent" | "title_asc";

function readClassification(
  value: string | string[] | undefined,
): ClassificationFilter | undefined {
  if (Array.isArray(value)) return undefined;
  const candidate = value;
  return ClassificationLabelSchema.safeParse(candidate).success ? candidate : undefined;
}

export function readSearchState(params: Record<string, string | string[] | undefined>): {
  query: string;
  type?: MediaFilter;
  classification?: ClassificationFilter;
  sort?: SearchSort;
  minDurationMs?: number;
  maxDurationMs?: number;
  publishedAfter?: string;
  publishedBefore?: string;
} {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const type = first(params.type);
  const classification = readClassification(params.classification);
  const sortValue = first(params.sort);
  const parseBound = (value: string | undefined) =>
    value && /^\d+$/.test(value) ? Number(value) : undefined;
  const minDurationMs = parseBound(first(params.minDurationMs));
  const maxDurationMs = parseBound(first(params.maxDurationMs));
  const publishedAfter = first(params.publishedAfter);
  const publishedBefore = first(params.publishedBefore);
  return {
    query: (first(params.q) ?? "").trim().slice(0, 100),
    type: type === "VIDEO" || type === "AUDIO" ? type : undefined,
    ...(classification ? { classification } : {}),
    ...(sortValue === "title_asc" ? { sort: "title_asc" as const } : {}),
    ...(minDurationMs !== undefined ? { minDurationMs } : {}),
    ...(maxDurationMs !== undefined ? { maxDurationMs } : {}),
    ...(publishedAfter ? { publishedAfter } : {}),
    ...(publishedBefore ? { publishedBefore } : {}),
  };
}
export function searchHref(
  query: string,
  type?: MediaFilter,
  classification?: ClassificationFilter,
  sort: SearchSort = "recent",
  minDurationMs?: number,
  maxDurationMs?: number,
  publishedAfter?: string,
  publishedBefore?: string,
): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim().slice(0, 100));
  if (type) params.set("type", type);
  const validClassification = readClassification(classification);
  if (validClassification) params.set("classification", validClassification);
  if (sort !== "recent") params.set("sort", sort);
  if (minDurationMs !== undefined) params.set("minDurationMs", String(minDurationMs));
  if (maxDurationMs !== undefined) params.set("maxDurationMs", String(maxDurationMs));
  if (publishedAfter) params.set("publishedAfter", publishedAfter);
  if (publishedBefore) params.set("publishedBefore", publishedBefore);
  return `/search${params.size ? `?${params.toString()}` : ""}`;
}
