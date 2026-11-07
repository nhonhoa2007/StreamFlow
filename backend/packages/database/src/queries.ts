import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import { outboxEventsTable } from "./schema.js";

export interface ClaimedOutboxEvent {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: Date;
}

export async function claimPendingOutboxEvents(
  sql: postgres.Sql,
  limit = 50,
): Promise<ClaimedOutboxEvent[]> {
  const rows = await sql<ClaimedOutboxEvent[]>`
    WITH reclaimed AS (
      UPDATE outbox_events
      SET status = 'PENDING'
      WHERE status = 'PROCESSING'
        AND created_at < NOW() - INTERVAL '5 minutes'
      RETURNING id
    ),
    claimed AS (
      SELECT id
      FROM outbox_events
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events
    SET status = 'PROCESSING'
    FROM claimed
    WHERE outbox_events.id = claimed.id
    RETURNING outbox_events.id, outbox_events.aggregate_type, outbox_events.aggregate_id,
              outbox_events.event_type, outbox_events.payload, outbox_events.status, outbox_events.created_at
  `;
  return rows;
}

export async function revertClaimedOutboxEvents(
  sql: postgres.Sql,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await sql`
    UPDATE outbox_events
    SET status = 'PENDING'
    WHERE id = ANY(${eventIds}::uuid[]) AND status = 'PROCESSING'
  `;
}

export async function markOutboxEventPublished<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
>(db: PostgresJsDatabase<TSchema>, eventId: string): Promise<void> {
  await db
    .update(outboxEventsTable)
    .set({
      status: "PUBLISHED",
      publishedAt: new Date(),
    })
    .where(eq(outboxEventsTable.id, eventId));
}

export interface ProcessAnalyticsEventInput {
  eventId: string;
  consumerGroup: string;
  mediaId: string;
  eventType?: string;
  timestamp: Date;
  watchTimeSeconds?: number;
}

export interface ProcessAnalyticsEventResult {
  processed: boolean;
}

export async function processAnalyticsEventAtomic(
  sql: postgres.Sql,
  input: ProcessAnalyticsEventInput,
): Promise<ProcessAnalyticsEventResult> {
  const {
    eventId,
    consumerGroup,
    mediaId,
    eventType = "playback.started",
    timestamp,
    watchTimeSeconds = 0,
  } = input;

  return await sql.begin(async (tx) => {
    // 1. Attempt deduplication insert in processed_events
    const inserted = await tx`
      INSERT INTO processed_events (event_id, consumer_group, processed_at)
      VALUES (${eventId}::uuid, ${consumerGroup}, NOW())
      ON CONFLICT (event_id, consumer_group) DO NOTHING
      RETURNING event_id
    `;

    // If duplicate event was already processed by this consumer group, skip
    if (inserted.length === 0) {
      return { processed: false };
    }

    // Only increment play_count on initial playback.started events
    const playIncrement = eventType === "playback.started" ? 1 : 0;

    // 2. Atomically upsert media_playback_stats projection
    await tx`
      INSERT INTO media_playback_stats (
        media_id,
        play_count,
        total_watch_time_seconds,
        last_played_at,
        updated_at
      )
      VALUES (
        ${mediaId}::uuid,
        ${playIncrement},
        ${watchTimeSeconds},
        ${timestamp.toISOString()}::timestamptz,
        NOW()
      )
      ON CONFLICT (media_id) DO UPDATE SET
        play_count = media_playback_stats.play_count + ${playIncrement},
        total_watch_time_seconds = media_playback_stats.total_watch_time_seconds + ${watchTimeSeconds},
        last_played_at = CASE
          WHEN media_playback_stats.last_played_at IS NULL THEN EXCLUDED.last_played_at
          ELSE GREATEST(media_playback_stats.last_played_at, EXCLUDED.last_played_at)
        END,
        updated_at = NOW()
    `;

    return { processed: true };
  });
}
