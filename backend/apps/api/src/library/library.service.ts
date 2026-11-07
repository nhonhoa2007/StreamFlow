import { Inject, Injectable } from "@nestjs/common";
import type {
  ContinueWatchingResponse,
  FavoriteListResponse,
  LibraryHistoryResponse,
} from "@streamflow/contracts";
import {
  type DatabaseHandle,
  addFavorite,
  getContinueWatching,
  listFavorites,
  listPlaybackHistory,
  removeFavorite,
} from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

@Injectable()
export class LibraryService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  async addFavorite(userId: string, mediaId: string) {
    await addFavorite(this.databaseHandle.db, userId, mediaId);
    return { status: "ok", favorited: true };
  }

  async removeFavorite(userId: string, mediaId: string) {
    await removeFavorite(this.databaseHandle.db, userId, mediaId);
    return { status: "ok", favorited: false };
  }

  async listFavorites(userId: string): Promise<FavoriteListResponse> {
    const items = await listFavorites(this.databaseHandle.db, userId);
    return { items };
  }

  async getContinueWatching(userId: string): Promise<ContinueWatchingResponse> {
    const items = await getContinueWatching(this.databaseHandle.db, userId);
    return { items };
  }

  async getHistory(userId: string): Promise<LibraryHistoryResponse> {
    const items = await listPlaybackHistory(this.databaseHandle.db, userId);
    return { items };
  }
}
