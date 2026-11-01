import type { PlaylistDetail, PlaylistItemDetail, PlaylistSummary } from "@streamflow/contracts";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import {
  type PlaylistItemSelect,
  type PlaylistSelect,
  mediaTable,
  playlistItemsTable,
  playlistsTable,
} from "./schema.js";

export async function createPlaylist(
  db: PostgresJsDatabase<Record<string, unknown>>,
  data: { ownerId: string; name: string; description?: string },
): Promise<PlaylistSelect> {
  const [created] = await db
    .insert(playlistsTable)
    .values({
      ownerId: data.ownerId,
      name: data.name,
      description: data.description,
    })
    .returning();

  return created;
}

export async function listPlaylistsForUser(
  db: PostgresJsDatabase<Record<string, unknown>>,
  ownerId: string,
): Promise<PlaylistSummary[]> {
  const rows = await db
    .select({
      id: playlistsTable.id,
      ownerId: playlistsTable.ownerId,
      name: playlistsTable.name,
      description: playlistsTable.description,
      version: playlistsTable.version,
      createdAt: playlistsTable.createdAt,
      updatedAt: playlistsTable.updatedAt,
      itemCount: count(playlistItemsTable.id),
    })
    .from(playlistsTable)
    .leftJoin(playlistItemsTable, eq(playlistsTable.id, playlistItemsTable.playlistId))
    .where(eq(playlistsTable.ownerId, ownerId))
    .groupBy(playlistsTable.id)
    .orderBy(desc(playlistsTable.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    name: r.name,
    description: r.description,
    version: r.version,
    itemCount: Number(r.itemCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getPlaylistDetail(
  db: PostgresJsDatabase<Record<string, unknown>>,
  playlistId: string,
  ownerId: string,
): Promise<PlaylistDetail | null> {
  const [playlist] = await db
    .select()
    .from(playlistsTable)
    .where(and(eq(playlistsTable.id, playlistId), eq(playlistsTable.ownerId, ownerId)))
    .limit(1);

  if (!playlist) {
    return null;
  }

  const items = await db
    .select({
      id: playlistItemsTable.id,
      mediaId: playlistItemsTable.mediaId,
      position: playlistItemsTable.position,
      addedAt: playlistItemsTable.addedAt,
      media: {
        id: mediaTable.id,
        type: mediaTable.type,
        title: mediaTable.title,
        slug: mediaTable.slug,
        durationMs: mediaTable.durationMs,
      },
    })
    .from(playlistItemsTable)
    .innerJoin(mediaTable, eq(playlistItemsTable.mediaId, mediaTable.id))
    .where(eq(playlistItemsTable.playlistId, playlistId))
    .orderBy(asc(playlistItemsTable.position));

  return {
    id: playlist.id,
    ownerId: playlist.ownerId,
    name: playlist.name,
    description: playlist.description,
    version: playlist.version,
    items: items.map((it) => ({
      ...it,
      addedAt: it.addedAt.toISOString(),
    })),
    createdAt: playlist.createdAt.toISOString(),
    updatedAt: playlist.updatedAt.toISOString(),
  };
}

export async function addPlaylistItem(
  db: PostgresJsDatabase<Record<string, unknown>>,
  playlistId: string,
  ownerId: string,
  mediaId: string,
): Promise<PlaylistItemSelect> {
  // Verify ownership
  const [playlist] = await db
    .select({ id: playlistsTable.id })
    .from(playlistsTable)
    .where(and(eq(playlistsTable.id, playlistId), eq(playlistsTable.ownerId, ownerId)))
    .limit(1);

  if (!playlist) {
    throw new Error("PLAYLIST_NOT_FOUND");
  }

  // Get max position
  const [maxPosRow] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${playlistItemsTable.position}), -1)` })
    .from(playlistItemsTable)
    .where(eq(playlistItemsTable.playlistId, playlistId));

  const nextPos = (maxPosRow?.maxPos ?? -1) + 1;

  const [item] = await db
    .insert(playlistItemsTable)
    .values({
      playlistId,
      mediaId,
      position: nextPos,
    })
    .returning();

  return item;
}

export async function removePlaylistItem(
  db: PostgresJsDatabase<Record<string, unknown>>,
  playlistId: string,
  ownerId: string,
  itemId: string,
): Promise<boolean> {
  const [playlist] = await db
    .select({ id: playlistsTable.id })
    .from(playlistsTable)
    .where(and(eq(playlistsTable.id, playlistId), eq(playlistsTable.ownerId, ownerId)))
    .limit(1);

  if (!playlist) {
    throw new Error("PLAYLIST_NOT_FOUND");
  }

  const deleted = await db
    .delete(playlistItemsTable)
    .where(and(eq(playlistItemsTable.playlistId, playlistId), eq(playlistItemsTable.id, itemId)))
    .returning();

  return deleted.length > 0;
}

export async function reorderPlaylistItemsWithOCC(
  sqlClient: postgres.Sql,
  playlistId: string,
  ownerId: string,
  expectedVersion: number,
  itemIds: string[],
): Promise<{ newVersion: number }> {
  return sqlClient.begin(async (sql) => {
    // 1. Optimistic lock update
    const updateRes = await sql`
      UPDATE playlists
      SET version = version + 1, updated_at = now()
      WHERE id = ${playlistId}::uuid
        AND owner_id = ${ownerId}::uuid
        AND version = ${expectedVersion}
      RETURNING version;
    `;

    if (updateRes.length === 0) {
      // Check if playlist exists to distinguish 404 vs 409
      const existing = await sql`
        SELECT id FROM playlists
        WHERE id = ${playlistId}::uuid AND owner_id = ${ownerId}::uuid
      `;
      if (existing.length === 0) {
        throw new Error("PLAYLIST_NOT_FOUND");
      }
      throw new Error("PLAYLIST_VERSION_CONFLICT");
    }

    const newVersion = updateRes[0].version as number;

    // 2. Validate all itemIds belong to this playlist
    const currentItems = await sql<{ id: string }[]>`
      SELECT id FROM playlist_items
      WHERE playlist_id = ${playlistId}::uuid
    `;

    if (currentItems.length !== itemIds.length) {
      throw new Error("INVALID_REORDER_ITEM_COUNT");
    }

    const currentIdSet = new Set(currentItems.map((r) => r.id));
    for (const id of itemIds) {
      if (!currentIdSet.has(id)) {
        throw new Error("INVALID_REORDER_ITEMS");
      }
    }

    // 3. Update positions
    for (let pos = 0; pos < itemIds.length; pos++) {
      await sql`
        UPDATE playlist_items
        SET position = ${pos}
        WHERE id = ${itemIds[pos]}::uuid AND playlist_id = ${playlistId}::uuid;
      `;
    }

    return { newVersion };
  });
}
