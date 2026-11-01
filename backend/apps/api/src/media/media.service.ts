import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  CursorPaginationQuerySchema,
  MediaDetailSchema,
  PaginatedMediaResponseSchema,
  SearchQuerySchema,
} from "@streamflow/contracts";
import {
  type DatabaseHandle,
  getMediaDetail,
  listMediaKeyset,
  searchMedia,
} from "@streamflow/database";
import { CacheService } from "../cache/cache.service.js";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

@Injectable()
export class MediaService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
    @Inject(CacheService)
    private readonly cacheService: CacheService,
  ) {}

  async list(queryRaw: Record<string, unknown>) {
    const parseResult = CursorPaginationQuerySchema.safeParse(queryRaw);
    if (!parseResult.success) {
      const messages = parseResult.error.issues
        .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
        .join("; ");
      throw new BadRequestException(messages);
    }

    const { type, limit, cursor } = parseResult.data;
    const cacheKey = `media:catalog:${type || "all"}:${limit}:${cursor || "first"}`;

    try {
      return await this.cacheService.getOrSetWithSingleflight(
        cacheKey,
        this.cacheService.defaultTtl,
        async () => {
          const result = await listMediaKeyset(this.databaseHandle.db, parseResult.data);
          return PaginatedMediaResponseSchema.parse(result);
        },
      );
    } catch (_err) {
      throw new ServiceUnavailableException("Media service temporarily unavailable");
    }
  }

  async getDetail(id: string, includeDraft = false) {
    if (includeDraft) {
      // Admin preview: do not cache
      const detail = await getMediaDetail(this.databaseHandle.db, id, true);
      if (!detail) {
        throw new NotFoundException("Media item not found");
      }
      return MediaDetailSchema.parse(detail);
    }

    const cacheKey = `media:detail:${id}`;

    try {
      const result = await this.cacheService.getOrSetWithSingleflight(
        cacheKey,
        this.cacheService.defaultTtl,
        async () => {
          const detail = await getMediaDetail(this.databaseHandle.db, id, false);
          if (!detail) {
            return null;
          }
          return MediaDetailSchema.parse(detail);
        },
      );

      if (!result) {
        throw new NotFoundException("Media item not found");
      }
      return result;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw new ServiceUnavailableException("Media service temporarily unavailable");
    }
  }

  async search(queryRaw: Record<string, unknown>) {
    const parseResult = SearchQuerySchema.safeParse(queryRaw);
    if (!parseResult.success) {
      const messages = parseResult.error.issues
        .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
        .join("; ");
      throw new BadRequestException(messages);
    }

    try {
      const items = await searchMedia(this.databaseHandle.db, parseResult.data);
      return PaginatedMediaResponseSchema.parse({
        items,
        nextCursor: null,
        hasMore: false,
      });
    } catch (_err) {
      throw new ServiceUnavailableException("Media service temporarily unavailable");
    }
  }
}
