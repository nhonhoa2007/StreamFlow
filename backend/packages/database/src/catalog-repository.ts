import type {
  CursorPaginationQuery,
  MediaDetail,
  MediaItem,
  SearchQuery,
} from "@streamflow/contracts";
import { and, desc, eq, ilike, inArray, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { albumsTable, artistsTable, mediaArtistsTable, mediaTable } from "./schema.js";

export interface CursorPayload {
  publishedAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf-8");
    const json = JSON.parse(raw);
    if (json && typeof json.publishedAt === "string" && typeof json.id === "string") {
      return json;
    }
    return null;
  } catch {
    return null;
  }
}

export async function listMediaKeyset(
  db: PostgresJsDatabase<Record<string, unknown>>,
  query: CursorPaginationQuery,
): Promise<{ items: MediaItem[]; nextCursor: string | null; hasMore: boolean }> {
  const conditions = [eq(mediaTable.status, "READY")];

  if (query.type) {
    conditions.push(eq(mediaTable.type, query.type));
  }

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      const cursorDate = new Date(cursor.publishedAt);
      const cursorCondition = or(
        lt(mediaTable.publishedAt, cursorDate),
        and(eq(mediaTable.publishedAt, cursorDate), lt(mediaTable.id, cursor.id)),
      );
      if (cursorCondition) {
        conditions.push(cursorCondition);
      }
    }
  }

  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

  const rows = await db
    .select({
      id: mediaTable.id,
      type: mediaTable.type,
      title: mediaTable.title,
      slug: mediaTable.slug,
      durationMs: mediaTable.durationMs,
      publishedAt: mediaTable.publishedAt,
    })
    .from(mediaTable)
    .where(and(...conditions))
    .orderBy(desc(mediaTable.publishedAt), desc(mediaTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    if (last.publishedAt) {
      nextCursor = encodeCursor({
        publishedAt: last.publishedAt.toISOString(),
        id: last.id,
      });
    }
  }

  const formattedItems: MediaItem[] = items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    durationMs: item.durationMs,
  }));

  return {
    items: formattedItems,
    nextCursor,
    hasMore,
  };
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
    .select()
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
    album,
    artists,
  };
}

export async function searchMedia(
  db: PostgresJsDatabase<Record<string, unknown>>,
  query: SearchQuery,
): Promise<MediaItem[]> {
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

  const searchCondition =
    matchedMediaIds.length > 0
      ? (or(ilike(mediaTable.title, searchTerm), inArray(mediaTable.id, matchedMediaIds)) ??
        ilike(mediaTable.title, searchTerm))
      : ilike(mediaTable.title, searchTerm);

  filterConditions.push(searchCondition);

  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

  const rows = await db
    .select({
      id: mediaTable.id,
      type: mediaTable.type,
      title: mediaTable.title,
      slug: mediaTable.slug,
      durationMs: mediaTable.durationMs,
    })
    .from(mediaTable)
    .where(and(...filterConditions))
    .orderBy(desc(mediaTable.publishedAt), desc(mediaTable.id))
    .limit(limit);

  return rows;
}
