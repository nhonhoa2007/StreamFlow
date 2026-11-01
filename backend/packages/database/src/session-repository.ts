import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  type RefreshSessionInsert,
  type RefreshSessionSelect,
  refreshSessionsTable,
} from "./schema.js";

export async function createRefreshSession(
  db: PostgresJsDatabase<Record<string, unknown>>,
  data: RefreshSessionInsert,
): Promise<RefreshSessionSelect> {
  const [created] = await db
    .insert(refreshSessionsTable)
    .values({
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    })
    .returning();
  return created;
}

export async function findSessionByTokenHash(
  db: PostgresJsDatabase<Record<string, unknown>>,
  tokenHash: string,
): Promise<RefreshSessionSelect | null> {
  const [session] = await db
    .select()
    .from(refreshSessionsTable)
    .where(eq(refreshSessionsTable.tokenHash, tokenHash))
    .limit(1);
  return session ?? null;
}

export async function revokeSession(
  db: PostgresJsDatabase<Record<string, unknown>>,
  sessionId: string,
): Promise<void> {
  await db
    .update(refreshSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshSessionsTable.id, sessionId));
}

export async function revokeAllSessionsForUser(
  db: PostgresJsDatabase<Record<string, unknown>>,
  userId: string,
): Promise<void> {
  await db
    .update(refreshSessionsTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshSessionsTable.userId, userId), isNull(refreshSessionsTable.revokedAt)));
}
