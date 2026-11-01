import type { ContinueItem } from "@streamflow/contracts";
import { and, desc, eq, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import {
  mediaTable,
  outboxEventsTable,
  playbackProgressTable,
  playbackSessionsTable,
} from "./schema.js";

export async function startPlaybackSession<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
>(
  db: PostgresJsDatabase<TSchema>,
  userId: string,
  mediaId: string,
): Promise<{ sessionId: string; positionMs: number }> {
  return await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(playbackSessionsTable)
      .values({
        userId,
        mediaId,
        lastSequence: 0,
      })
      .returning();

    const [progress] = await tx
      .select({ positionMs: playbackProgressTable.positionMs })
      .from(playbackProgressTable)
      .where(
        and(eq(playbackProgressTable.userId, userId), eq(playbackProgressTable.mediaId, mediaId)),
      )
      .limit(1);

    const positionMs = progress?.positionMs ?? 0;

    await tx.insert(outboxEventsTable).values({
      aggregateType: "playback",
      aggregateId: mediaId,
      eventType: "playback.started",
      payload: {
        sessionId: session.id,
        userId,
        mediaId,
        positionMs,
        timestamp: new Date().toISOString(),
      },
      status: "PENDING",
    });

    return {
      sessionId: session.id,
      positionMs,
    };
  });
}

export async function updatePlaybackProgressMonotonic(
  sqlClient: postgres.Sql,
  sessionId: string,
  userId: string,
  sequence: number,
  positionMs: number,
): Promise<{
  status: "updated" | "ignored";
  reason?: string;
  lastSequence: number;
  positionMs: number;
}> {
  return sqlClient.begin(async (sql) => {
    // 1. Check session
    const sessions = await sql`
      SELECT id, media_id, last_sequence
      FROM playback_sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE;
    `;

    if (sessions.length === 0) {
      throw new Error("SESSION_NOT_FOUND");
    }

    const session = sessions[0];
    const mediaId = session.media_id as string;
    const sessionLastSeq = session.last_sequence as number;

    // 2. Monotonic sequence check against session
    if (sequence <= sessionLastSeq) {
      const currentProg = await sql`
        SELECT position_ms, last_sequence
        FROM playback_progress
        WHERE user_id = ${userId}::uuid AND media_id = ${mediaId}::uuid
      `;
      return {
        status: "ignored",
        reason: "stale_sequence",
        lastSequence: sessionLastSeq,
        positionMs: currentProg[0]?.position_ms ?? positionMs,
      };
    }

    // 3. Upsert playback_progress with monotonic condition
    const upsertRes = await sql`
      INSERT INTO playback_progress (user_id, media_id, position_ms, last_sequence, updated_at)
      VALUES (${userId}::uuid, ${mediaId}::uuid, ${positionMs}, ${sequence}, now())
      ON CONFLICT (user_id, media_id) DO UPDATE
      SET position_ms = EXCLUDED.position_ms,
          last_sequence = EXCLUDED.last_sequence,
          updated_at = now()
      WHERE playback_progress.last_sequence < EXCLUDED.last_sequence
      RETURNING position_ms, last_sequence;
    `;

    // 4. Advance session last_sequence
    await sql`
      UPDATE playback_sessions
      SET last_sequence = ${sequence}
      WHERE id = ${sessionId}::uuid;
    `;

    if (upsertRes.length === 0) {
      // Progress had higher sequence from another session
      const currentProg = await sql`
        SELECT position_ms, last_sequence
        FROM playback_progress
        WHERE user_id = ${userId}::uuid AND media_id = ${mediaId}::uuid
      `;
      return {
        status: "ignored",
        reason: "stale_sequence",
        lastSequence: currentProg[0]?.last_sequence ?? sequence,
        positionMs: currentProg[0]?.position_ms ?? positionMs,
      };
    }

    // Emit outbox progress event transactionally
    await sql`
      INSERT INTO outbox_events (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        status,
        created_at
      )
      VALUES (
        'playback',
        ${mediaId}::uuid,
        'playback.progress',
        ${JSON.stringify({
          sessionId,
          userId,
          mediaId,
          sequence,
          positionMs,
          watchTimeSeconds: Math.max(1, Math.floor(positionMs / 1000)),
          timestamp: new Date().toISOString(),
        })},
        'PENDING',
        NOW()
      )
    `;

    return {
      status: "updated",
      lastSequence: sequence,
      positionMs: upsertRes[0].position_ms as number,
    };
  });
}

export async function getContinueWatching(
  db: PostgresJsDatabase<Record<string, unknown>>,
  userId: string,
): Promise<ContinueItem[]> {
  const rows = await db
    .select({
      mediaId: playbackProgressTable.mediaId,
      positionMs: playbackProgressTable.positionMs,
      updatedAt: playbackProgressTable.updatedAt,
      media: {
        id: mediaTable.id,
        type: mediaTable.type,
        title: mediaTable.title,
        slug: mediaTable.slug,
        durationMs: mediaTable.durationMs,
      },
    })
    .from(playbackProgressTable)
    .innerJoin(mediaTable, eq(playbackProgressTable.mediaId, mediaTable.id))
    .where(
      and(
        eq(playbackProgressTable.userId, userId),
        eq(mediaTable.status, "READY"),
        gt(playbackProgressTable.positionMs, 0),
      ),
    )
    .orderBy(desc(playbackProgressTable.updatedAt))
    .limit(20);

  return rows.map((r) => ({
    mediaId: r.mediaId,
    positionMs: r.positionMs,
    updatedAt: r.updatedAt.toISOString(),
    media: r.media,
  }));
}
