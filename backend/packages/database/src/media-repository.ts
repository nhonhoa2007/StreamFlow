import type { MediaItem, MediaListQuery } from "@streamflow/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mediaTable } from "./schema.js";

export async function listReadyMedia(
  db: PostgresJsDatabase<Record<string, unknown>>,
  query: MediaListQuery,
): Promise<MediaItem[]> {
  const conditions = [eq(mediaTable.status, "READY")];

  if (query.type) {
    conditions.push(eq(mediaTable.type, query.type));
  }

  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

  const rows = await db
    .select({
      id: mediaTable.id,
      type: mediaTable.type,
      title: mediaTable.title,
      slug: mediaTable.slug,
      durationMs: mediaTable.durationMs,
      classificationLabels: mediaTable.classificationLabels,
    })
    .from(mediaTable)
    .where(and(...conditions))
    .orderBy(desc(mediaTable.createdAt), desc(mediaTable.id))
    .limit(limit);

  return rows;
}
