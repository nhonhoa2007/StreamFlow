import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MediaListQuerySchema, MediaListResponseSchema } from "@streamflow/contracts";
import { type DatabaseHandle, listReadyMedia } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../health/health.controller.js";

@Injectable()
export class MediaService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  async list(queryRaw: Record<string, unknown>) {
    const parseResult = MediaListQuerySchema.safeParse(queryRaw);
    if (!parseResult.success) {
      const messages = parseResult.error.issues
        .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
        .join("; ");
      throw new BadRequestException(messages);
    }

    try {
      const items = await listReadyMedia(this.databaseHandle.db, parseResult.data);
      return MediaListResponseSchema.parse({ items });
    } catch (_err) {
      throw new ServiceUnavailableException("Media service temporarily unavailable");
    }
  }
}
