import { and, desc, eq, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  type MediaAssetInsert,
  type MediaAssetSelect,
  type UploadSessionInsert,
  type UploadSessionSelect,
  mediaAssetsTable,
  uploadSessionsTable,
} from "./schema.js";

export async function createUploadSession(
  db: PostgresJsDatabase<Record<string, unknown>>,
  data: UploadSessionInsert,
): Promise<UploadSessionSelect> {
  const [created] = await db.insert(uploadSessionsTable).values(data).returning();
  return created;
}

export async function findUploadSessionById(
  db: PostgresJsDatabase<Record<string, unknown>>,
  id: string,
): Promise<UploadSessionSelect | null> {
  const [session] = await db
    .select()
    .from(uploadSessionsTable)
    .where(eq(uploadSessionsTable.id, id))
    .limit(1);

  return session ?? null;
}

export async function completeUploadSessionAndCreateAsset(
  db: PostgresJsDatabase<Record<string, unknown>>,
  sessionId: string,
  assetData: MediaAssetInsert,
): Promise<MediaAssetSelect> {
  // 1. Update session status to UPLOADED
  await db
    .update(uploadSessionsTable)
    .set({
      status: "UPLOADED",
      updatedAt: new Date(),
    })
    .where(eq(uploadSessionsTable.id, sessionId));

  // 2. Insert media asset
  const [asset] = await db.insert(mediaAssetsTable).values(assetData).returning();

  return asset;
}

export async function findMediaAssetByObjectKey(
  db: PostgresJsDatabase<Record<string, unknown>>,
  objectKey: string,
): Promise<MediaAssetSelect | null> {
  const [asset] = await db
    .select()
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.objectKey, objectKey))
    .limit(1);

  return asset ?? null;
}

export async function expireOldUploadSessions(
  db: PostgresJsDatabase<Record<string, unknown>>,
): Promise<number> {
  const expired = await db
    .update(uploadSessionsTable)
    .set({
      status: "EXPIRED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(uploadSessionsTable.status, "UPLOADING"),
        lt(uploadSessionsTable.expiresAt, new Date()),
      ),
    )
    .returning();

  return expired.length;
}
