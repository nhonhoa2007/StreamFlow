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
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

@Injectable()
export class MediaService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  async list(queryRaw: Record<string, unknown>) {
    const parseResult = CursorPaginationQuerySchema.safeParse(queryRaw);
    if (!parseResult.success) {
      const messages = parseResult.error.issues
        .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
        .join("; ");
      throw new BadRequestException(messages);
    }

    try {
      const result = await listMediaKeyset(this.databaseHandle.db, parseResult.data);
      return PaginatedMediaResponseSchema.parse(result);
    } catch (_err) {
      throw new ServiceUnavailableException("Media service temporarily unavailable");
    }
  }

  async getDetail(id: string, includeDraft = false) {
    try {
      const detail = await getMediaDetail(this.databaseHandle.db, id, includeDraft);
      if (!detail) {
        throw new NotFoundException("Media item not found");
      }
      return MediaDetailSchema.parse(detail);
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
