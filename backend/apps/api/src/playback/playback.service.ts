import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ProgressResponse,
  StartPlaybackResponse,
  UpdateProgress,
} from "@streamflow/contracts";
import {
  type DatabaseHandle,
  startPlaybackSession,
  updatePlaybackProgressMonotonic,
} from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

@Injectable()
export class PlaybackService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  async start(userId: string, mediaId: string): Promise<StartPlaybackResponse> {
    const res = await startPlaybackSession(this.databaseHandle.db, userId, mediaId);
    return {
      sessionId: res.sessionId,
      mediaId,
      positionMs: res.positionMs,
    };
  }

  async updateProgress(
    sessionId: string,
    userId: string,
    data: UpdateProgress,
  ): Promise<ProgressResponse> {
    try {
      return await updatePlaybackProgressMonotonic(
        this.databaseHandle.client,
        sessionId,
        userId,
        data.sequence,
        data.positionMs,
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message;
      if (msg === "SESSION_NOT_FOUND") {
        throw new NotFoundException("Playback session not found");
      }
      throw err;
    }
  }
}
