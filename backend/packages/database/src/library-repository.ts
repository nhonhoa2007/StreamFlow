import type { FavoriteItem } from "@streamflow/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { favoritesTable, mediaTable } from "./schema.js";

export async function addFavorite(
  db: PostgresJsDatabase<Record<string, unknown>>,
  userId: string,
  mediaId: string,
): Promise<boolean> {
  const [inserted] = await db
    .insert(favoritesTable)
    .values({ userId, mediaId })
    .onConflictDoNothing()
    .returning();

  return inserted !== undefined;
}

export async function removeFavorite(
  db: PostgresJsDatabase<Record<string, unknown>>,
  userId: string,
  mediaId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(favoritesTable)
    .where(and(eq(favoritesTable.userId, userId), eq(favoritesTable.mediaId, mediaId)))
    .returning();

  return deleted.length > 0;
}

export async function listFavorites(
  db: PostgresJsDatabase<Record<string, unknown>>,
  userId: string,
): Promise<FavoriteItem[]> {
  const rows = await db
    .select({
      mediaId: favoritesTable.mediaId,
      createdAt: favoritesTable.createdAt,
      media: {
        id: mediaTable.id,
        type: mediaTable.type,
        title: mediaTable.title,
        slug: mediaTable.slug,
        durationMs: mediaTable.durationMs,
      },
    })
    .from(favoritesTable)
    .innerJoin(mediaTable, eq(favoritesTable.mediaId, mediaTable.id))
    .where(and(eq(favoritesTable.userId, userId), eq(mediaTable.status, "READY")))
    .orderBy(desc(favoritesTable.createdAt));

  return rows.map((r) => ({
    mediaId: r.mediaId,
    createdAt: r.createdAt.toISOString(),
    media: r.media,
  }));
}
