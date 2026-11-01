import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import {
  type MediaAssetInsert,
  type TranscodeJobSelect,
  mediaAssetsTable,
  mediaTable,
  transcodeJobsTable,
  type transcodeStatusEnum,
} from "./schema.js";

export async function findTranscodeJobById(
  db: PostgresJsDatabase<Record<string, unknown>>,
  id: string,
): Promise<TranscodeJobSelect | null> {
  const [job] = await db
    .select()
    .from(transcodeJobsTable)
    .where(eq(transcodeJobsTable.id, id))
    .limit(1);

  return job ?? null;
}

export async function updateTranscodeJobStatus(
  db: PostgresJsDatabase<Record<string, unknown>>,
  id: string,
  status: (typeof transcodeStatusEnum.enumValues)[number],
  progressPercent = 0,
  errorMessage?: string,
): Promise<void> {
  await db
    .update(transcodeJobsTable)
    .set({
      status,
      progressPercent,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(transcodeJobsTable.id, id));
}

export async function publishTranscodedMediaAtomic(
  sqlClient: postgres.Sql,
  mediaId: string,
  jobId: string,
  assets: MediaAssetInsert[],
): Promise<void> {
  await sqlClient.begin(async (sql) => {
    // 1. Insert assets
    for (const a of assets) {
      await sql`
        INSERT INTO media_assets (media_id, kind, object_key, size_bytes, mime_type, checksum)
        VALUES (
          ${a.mediaId}::uuid,
          ${a.kind},
          ${a.objectKey},
          ${String(a.sizeBytes)}::bigint,
          ${a.mimeType},
          ${a.checksum ?? null}
        )
        ON CONFLICT (object_key) DO NOTHING;
      `;
    }

    // 2. Mark media as READY
    await sql`
      UPDATE media
      SET status = 'READY', published_at = COALESCE(published_at, now()), updated_at = now()
      WHERE id = ${mediaId}::uuid;
    `;

    // 3. Mark job as COMPLETED
    await sql`
      UPDATE transcode_jobs
      SET status = 'COMPLETED', progress_percent = 100, updated_at = now()
      WHERE id = ${jobId}::uuid;
    `;
  });
}
