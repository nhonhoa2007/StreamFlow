import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreatePlaylist,
  PlaylistDetail,
  PlaylistSummary,
  UpdatePlaylist,
} from "@streamflow/contracts";
import {
  type DatabaseHandle,
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  getPlaylistDetail,
  listPlaylistsForUser,
  removePlaylistItem,
  reorderPlaylistItemsWithOCC,
  updatePlaylist,
} from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

@Injectable()
export class PlaylistService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  async create(userId: string, data: CreatePlaylist) {
    return createPlaylist(this.databaseHandle.db, {
      ownerId: userId,
      name: data.name,
      description: data.description,
    });
  }

  async list(userId: string): Promise<PlaylistSummary[]> {
    return listPlaylistsForUser(this.databaseHandle.db, userId);
  }

  async update(playlistId: string, userId: string, data: UpdatePlaylist) {
    const result = await updatePlaylist(this.databaseHandle.db, playlistId, userId, data);
    if (!result) {
      throw new NotFoundException("Playlist not found");
    }
    return result;
  }

  async delete(playlistId: string, userId: string) {
    const removed = await deletePlaylist(this.databaseHandle.db, playlistId, userId);
    if (!removed) {
      throw new NotFoundException("Playlist not found");
    }
    return { status: "deleted" };
  }

  async getDetail(playlistId: string, userId: string): Promise<PlaylistDetail> {
    const detail = await getPlaylistDetail(this.databaseHandle.db, playlistId, userId);
    if (!detail) {
      throw new NotFoundException("Playlist not found");
    }
    return detail;
  }

  async addItem(playlistId: string, userId: string, mediaId: string) {
    try {
      return await addPlaylistItem(this.databaseHandle.db, playlistId, userId, mediaId);
    } catch (err: unknown) {
      const msg = (err as Error)?.message;
      if (msg === "PLAYLIST_NOT_FOUND") {
        throw new NotFoundException("Playlist not found");
      }
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        throw new BadRequestException("Media item already in playlist");
      }
      throw err;
    }
  }

  async removeItem(playlistId: string, userId: string, itemId: string) {
    try {
      const removed = await removePlaylistItem(this.databaseHandle.db, playlistId, userId, itemId);
      if (!removed) {
        throw new NotFoundException("Item not found in playlist");
      }
      return { status: "deleted" };
    } catch (err: unknown) {
      const msg = (err as Error)?.message;
      if (msg === "PLAYLIST_NOT_FOUND") {
        throw new NotFoundException("Playlist not found");
      }
      throw err;
    }
  }

  async reorder(playlistId: string, userId: string, expectedVersion: number, itemIds: string[]) {
    try {
      return await reorderPlaylistItemsWithOCC(
        this.databaseHandle.client,
        playlistId,
        userId,
        expectedVersion,
        itemIds,
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message;
      if (msg === "PLAYLIST_NOT_FOUND") {
        throw new NotFoundException("Playlist not found");
      }
      if (msg === "PLAYLIST_VERSION_CONFLICT") {
        throw new ConflictException("Playlist was updated concurrently. Please refresh.");
      }
      if (msg === "INVALID_REORDER_ITEMS" || msg === "INVALID_REORDER_ITEM_COUNT") {
        throw new BadRequestException("Item list does not match playlist items");
      }
      throw err;
    }
  }
}
