import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  PlaybackManifestResponse,
  ProgressResponse,
  RenditionProfile,
  StartPlaybackResponse,
  UpdateProgress,
} from "@streamflow/contracts";
import {
  type DatabaseHandle,
  mediaAssetsTable,
  mediaTable,
  startPlaybackSession,
  updatePlaybackProgressMonotonic,
} from "@streamflow/database";
import { and, eq } from "drizzle-orm";
import { API_CONFIG_TOKEN, DATABASE_HANDLE_TOKEN } from "../constants.js";
import type { StorageConfig } from "../storage/storage.service.js";

@Injectable()
export class PlaybackService {
  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
    @Inject(API_CONFIG_TOKEN)
    private readonly config: StorageConfig,
  ) {}

  private buildAssetUrl(objectKey: string): string {
    if (this.config.STORAGE_PUBLIC_URL) {
      return `${this.config.STORAGE_PUBLIC_URL}/${objectKey}`;
    }
    const endpoint = this.config.STORAGE_ENDPOINT || "http://127.0.0.1:9000";
    const bucket = this.config.STORAGE_BUCKET_NAME || "streamflow-media-dev";
    return `${endpoint}/${bucket}/${objectKey}`;
  }

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

  async getManifest(mediaId: string): Promise<PlaybackManifestResponse> {
    const db = this.databaseHandle.db;

    // Check media exists and is READY
    const [media] = await db
      .select()
      .from(mediaTable)
      .where(and(eq(mediaTable.id, mediaId), eq(mediaTable.status, "READY")))
      .limit(1);

    if (!media) {
      throw new NotFoundException("Media item not found or not ready for playback");
    }

    // Fetch assets for this media
    const assets = await db
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.mediaId, mediaId));

    const masterAsset = assets.find(
      (a) => a.kind === "HLS_PLAYLIST" && a.objectKey.endsWith("master.m3u8"),
    );

    const masterPlaylistUrl = masterAsset
      ? this.buildAssetUrl(masterAsset.objectKey)
      : this.buildAssetUrl(`hls/${mediaId}/master.m3u8`);

    const thumbnailAsset = assets.find((a) => a.kind === "THUMBNAIL");
    const thumbnailUrl = thumbnailAsset ? this.buildAssetUrl(thumbnailAsset.objectKey) : undefined;

    const variantAssets = assets.filter(
      (a) => a.kind === "HLS_PLAYLIST" && !a.objectKey.endsWith("master.m3u8"),
    );

    const renditions: RenditionProfile[] = variantAssets.map((va) => {
      const filename = va.objectKey.split("/").pop() || "";
      const name = filename.replace(".m3u8", "");
      let width = 1280;
      let height = 720;
      let videoBitrateKbps = 2200;
      let audioBitrateKbps = 128;

      if (name === "1080p") {
        width = 1920;
        height = 1080;
        videoBitrateKbps = 4500;
        audioBitrateKbps = 192;
      } else if (name === "360p") {
        width = 640;
        height = 360;
        videoBitrateKbps = 800;
        audioBitrateKbps = 96;
      }

      return {
        name,
        width,
        height,
        videoBitrateKbps,
        audioBitrateKbps,
        playlistKey: va.objectKey,
      };
    });

    return {
      mediaId: media.id,
      type: media.type,
      title: media.title,
      masterPlaylistUrl,
      thumbnailUrl,
      sourceUrl:
        media.type === "AUDIO"
          ? assets
              .filter((asset) => asset.kind === "SOURCE_AUDIO")
              .map((asset) => this.buildAssetUrl(asset.objectKey))[0]
          : undefined,
      renditions,
    };
  }

  async getThumbnail(
    mediaId: string,
  ): Promise<{ mediaId: string; objectKey: string; thumbnailUrl: string }> {
    const db = this.databaseHandle.db;

    const [thumb] = await db
      .select()
      .from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.mediaId, mediaId), eq(mediaAssetsTable.kind, "THUMBNAIL")))
      .limit(1);

    if (!thumb) {
      throw new NotFoundException("Thumbnail not found for this media");
    }

    return {
      mediaId,
      objectKey: thumb.objectKey,
      thumbnailUrl: this.buildAssetUrl(thumb.objectKey),
    };
  }
}
