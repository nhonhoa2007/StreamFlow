import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminCreateMedia, AdminUpdateMedia } from "@streamflow/contracts";
import { type DatabaseHandle, mediaArtistsTable, mediaTable } from "@streamflow/database";
import { desc, eq } from "drizzle-orm";
import { CacheService } from "../cache/cache.service.js";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";
import { QueueService } from "../queue/queue.service.js";

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
    @Inject(CacheService)
    private readonly cacheService: CacheService,
    @Inject(QueueService)
    private readonly queueService: QueueService,
  ) {}

  async create(data: AdminCreateMedia) {
    const db = this.databaseHandle.db;

    try {
      const [media] = await db
        .insert(mediaTable)
        .values({
          type: data.type,
          title: data.title,
          slug: data.slug,
          status: "DRAFT",
          durationMs: data.durationMs,
          albumId: data.albumId,
        })
        .returning();

      if (data.artistIds && data.artistIds.length > 0) {
        for (const a of data.artistIds) {
          await db.insert(mediaArtistsTable).values({
            mediaId: media.id,
            artistId: a.artistId,
            role: a.role,
          });
        }
      }

      await this.cacheService.deleteByPattern("media:catalog:*");

      return media;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        throw new BadRequestException("Media with this slug already exists");
      }
      throw err;
    }
  }

  async list() {
    return this.databaseHandle.db.select().from(mediaTable).orderBy(desc(mediaTable.createdAt));
  }

  async update(id: string, data: AdminUpdateMedia) {
    const db = this.databaseHandle.db;

    const [existing] = await db.select().from(mediaTable).where(eq(mediaTable.id, id)).limit(1);

    if (!existing) {
      throw new NotFoundException("Media item not found");
    }

    const updateValues: Partial<typeof mediaTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.type !== undefined) updateValues.type = data.type;
    if (data.title !== undefined) updateValues.title = data.title;
    if (data.slug !== undefined) updateValues.slug = data.slug;
    if (data.durationMs !== undefined) updateValues.durationMs = data.durationMs;
    if (data.albumId !== undefined) updateValues.albumId = data.albumId;

    if (data.status !== undefined) {
      updateValues.status = data.status;
      if (data.status === "READY" && !existing.publishedAt) {
        updateValues.publishedAt = new Date();
      }
    }

    const [updated] = await db
      .update(mediaTable)
      .set(updateValues)
      .where(eq(mediaTable.id, id))
      .returning();

    if (data.artistIds) {
      await db.delete(mediaArtistsTable).where(eq(mediaArtistsTable.mediaId, id));
      for (const a of data.artistIds) {
        await db.insert(mediaArtistsTable).values({
          mediaId: id,
          artistId: a.artistId,
          role: a.role,
        });
      }
    }

    // Invalidate cached detail and catalog
    await this.cacheService.del(`media:detail:${id}`);
    await this.cacheService.deleteByPattern("media:catalog:*");

    return updated;
  }

  async delete(id: string) {
    const db = this.databaseHandle.db;
    await db.delete(mediaTable).where(eq(mediaTable.id, id));

    await this.cacheService.del(`media:detail:${id}`);
    await this.cacheService.deleteByPattern("media:catalog:*");

    return { status: "deleted" };
  }

  async triggerTranscode(mediaId: string, profileVersion = 1) {
    return this.queueService.enqueueTranscode(mediaId, profileVersion);
  }

  async getTranscodeJobs(mediaId: string) {
    return this.queueService.getJobsForMedia(mediaId);
  }

  async getTranscodeJobById(jobId: string) {
    return this.queueService.getJobStatus(jobId);
  }
}
