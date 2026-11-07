import type { ClassificationLabel, MediaMetadata } from "@streamflow/contracts";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mediaTable } from "./schema.js";

export async function updateMediaClassification(
  db: PostgresJsDatabase<Record<string, unknown>>,
  mediaId: string,
  metadata: MediaMetadata,
  labels: ClassificationLabel[],
): Promise<void> {
  await db
    .update(mediaTable)
    .set({ metadata, classificationLabels: labels, updatedAt: new Date() })
    .where(eq(mediaTable.id, mediaId));
}
