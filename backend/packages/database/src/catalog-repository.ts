import type {
  CursorPaginationQuery,
  MediaDetail,
  MediaItem,
  PaginatedMediaResponse,
  SearchQuery,
} from "@streamflow/contracts";
import {
  type SQL,
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { albumsTable, artistsTable, mediaArtistsTable, mediaTable } from "./schema.js";

export interface CursorPayload {
  publishedAt?: string;
  id: string;
  sort?: "recent" | "title_asc";
  title?: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf-8");
    const json = JSON.parse(raw);
    if (
      json &&
      typeof json.id === "string" &&
      (typeof json.publishedAt === "string" || typeof json.title === "string")
    ) {
      return json;
    }
    return null;
  } catch {
    return null;
  }
}

const catalogTime = sql`coalesce(${mediaTable.publishedAt}, ${mediaTable.createdAt})`;
// Keep the full PostgreSQL precision in the opaque cursor, including microseconds.
const cursorTime = sql<string>`${catalogTime}::text`;

function addCursorCondition(
  conditions: SQL[],
  encoded?: string,
  sort: "recent" | "title_asc" = "recent",
): void {
  if (!encoded) return;
  const cursor = decodeCursor(encoded);
  if (!cursor) return;
  if (sort === "title_asc") {
    if (!cursor.title) return;
    const condition = or(
      gt(mediaTable.title, cursor.title),
      and(eq(mediaTable.title, cursor.title), gt(mediaTable.id, cursor.id)),
    );
    if (condition) conditions.push(condition);
    return;
  }
  if (!cursor.publishedAt) return;
  const timestamp = cursor.publishedAt;
  const condition = or(
    lt(catalogTime, timestamp),
    and(eq(catalogTime, timestamp), lt(mediaTable.id, cursor.id)),
  );
  if (condition) conditions.push(condition);
}

function addClassificationCondition(conditions: SQL[], classification?: string): void {
  if (!classification) return;
  conditions.push(sql`${mediaTable.classificationLabels} @> ARRAY[${classification}]::text[]`);
}

function toMediaPage(
  rows: (MediaItem & { publishedAt: string })[],
  limit: number,
  sort: "recent" | "title_asc" = "recent",
): PaginatedMediaResponse {
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map(({ publishedAt: _timestamp, ...item }) => item),
    nextCursor:
      hasMore && last
        ? sort === "title_asc"
          ? encodeCursor({ title: last.title, id: last.id, sort })
          : encodeCursor({ publishedAt: last.publishedAt, id: last.id })
        : null,
    hasMore,
  };
}

export async function listMediaKeyset(
  db: PostgresJsDatabase<Record<string, unknown>>,
  query: CursorPaginationQuery,
): Promise<PaginatedMediaResponse> {
  const conditions = [eq(mediaTable.status, "READY")];
  if (query.type) conditions.push(eq(mediaTable.type, query.type));
  addClassificationCondition(conditions, query.classification);
  if (query.minDurationMs !== undefined)
    conditions.push(gte(mediaTable.durationMs, query.minDurationMs));
  if (query.maxDurationMs !== undefined)
    conditions.push(lte(mediaTable.durationMs, query.maxDurationMs));
  if (query.publishedAfter) conditions.push(gte(catalogTime, query.publishedAfter));
  if (query.publishedBefore) conditions.push(lte(catalogTime, query.publishedBefore));
  const sort = query.sort ?? "recent";
  addCursorCondition(conditions, query.cursor, sort);
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const rows = await db
    .select({
      id: mediaTable.id,
      type: mediaTable.type,
      title: mediaTable.title,
      slug: mediaTable.slug,
      durationMs: mediaTable.durationMs,
      classificationLabels: mediaTable.classificationLabels,
      publishedAt: cursorTime,
    })
    .from(mediaTable)
    .where(and(...conditions))
    .orderBy(
      sort === "title_asc" ? asc(mediaTable.title) : desc(catalogTime),
      sort === "title_asc" ? asc(mediaTable.id) : desc(mediaTable.id),
    )
    .limit(limit + 1);
  return toMediaPage(rows, limit, sort);
}

export async function getMediaDetail(
  db: PostgresJsDatabase<Record<string, unknown>>,
  id: string,
  includeDraft = false,
): Promise<MediaDetail | null> {
  const conditions = [eq(mediaTable.id, id)];
  if (!includeDraft) {
    conditions.push(eq(mediaTable.status, "READY"));
  }

  const [media] = await db
    .select({
      id: mediaTable.id,
      type: mediaTable.type,
      title: mediaTable.title,
      slug: mediaTable.slug,
      durationMs: mediaTable.durationMs,
      classificationLabels: mediaTable.classificationLabels,
      albumId: mediaTable.albumId,
    })
    .from(mediaTable)
    .where(and(...conditions))
    .limit(1);

  if (!media) {
    return null;
  }

  let album: { id: string; title: string; slug: string } | null = null;
  if (media.albumId) {
    const [albumRow] = await db
      .select({
        id: albumsTable.id,
        title: albumsTable.title,
        slug: albumsTable.slug,
      })
      .from(albumsTable)
      .where(eq(albumsTable.id, media.albumId))
      .limit(1);
    if (albumRow) {
      album = albumRow;
    }
  }

  const artists = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      slug: artistsTable.slug,
      role: mediaArtistsTable.role,
    })
    .from(mediaArtistsTable)
    .innerJoin(artistsTable, eq(mediaArtistsTable.artistId, artistsTable.id))
    .where(eq(mediaArtistsTable.mediaId, media.id));

  return {
    id: media.id,
    type: media.type,
    title: media.title,
    slug: media.slug,
    durationMs: media.durationMs,
    classificationLabels: media.classificationLabels,
    album,
    artists,
  };
}

export async function searchMedia(
  db: PostgresJsDatabase<Record<string, unknown>>,
  query: SearchQuery,
): Promise<PaginatedMediaResponse> {
  const searchTerm = `%${query.q}%`;

  // Find media IDs that match artist name
  const artistMatches = await db
    .select({ mediaId: mediaArtistsTable.mediaId })
    .from(mediaArtistsTable)
    .innerJoin(artistsTable, eq(mediaArtistsTable.artistId, artistsTable.id))
    .where(ilike(artistsTable.name, searchTerm));

  const matchedMediaIds = artistMatches.map((m) => m.mediaId);

  const filterConditions = [eq(mediaTable.status, "READY")];
  if (query.type) {
    filterConditions.push(eq(mediaTable.type, query.type));
  }
  addClassificationCondition(filterConditions, query.classification);
  if (query.minDurationMs !== undefined)
    filterConditions.push(gte(mediaTable.durationMs, query.minDurationMs));
  if (query.maxDurationMs !== undefined)
    filterConditions.push(lte(mediaTable.durationMs, query.maxDurationMs));
  if (query.publishedAfter) filterConditions.push(gte(catalogTime, query.publishedAfter));
  if (query.publishedBefore) filterConditions.push(lte(catalogTime, query.publishedBefore));

  const searchCondition =
    matchedMediaIds.length > 0
      ? (or(ilike(mediaTable.title, searchTerm), inArray(mediaTable.id, matchedMediaIds)) ??
        ilike(mediaTable.title, searchTerm))
      : ilike(mediaTable.title, searchTerm);

  filterConditions.push(searchCondition);
  const sort = query.sort ?? "recent";
  addCursorCondition(filterConditions, query.cursor, sort);

  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

  const rows = await db
    .select({
      id: mediaTable.id,
      type: mediaTable.type,
      title: mediaTable.title,
      slug: mediaTable.slug,
      durationMs: mediaTable.durationMs,
      classificationLabels: mediaTable.classificationLabels,
      publishedAt: cursorTime,
    })
    .from(mediaTable)
    .where(and(...filterConditions))
    .orderBy(
      sort === "title_asc" ? asc(mediaTable.title) : desc(catalogTime),
      sort === "title_asc" ? asc(mediaTable.id) : desc(mediaTable.id),
    )
    .limit(limit + 1);

  return toMediaPage(rows, limit, sort);
}
