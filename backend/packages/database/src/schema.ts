import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", ["AUDIO", "VIDEO"]);
export const mediaStatusEnum = pgEnum("media_status", ["DRAFT", "READY"]);
export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);
export const artistRoleEnum = pgEnum("artist_role", ["MAIN", "FEATURED", "PRODUCER"]);
export const uploadSessionStatusEnum = pgEnum("upload_session_status", [
  "UPLOADING",
  "UPLOADED",
  "EXPIRED",
  "FAILED",
]);
export const assetKindEnum = pgEnum("asset_kind", [
  "SOURCE_AUDIO",
  "SOURCE_VIDEO",
  "THUMBNAIL",
  "HLS_PLAYLIST",
  "HLS_SEGMENT",
]);
export const transcodeStatusEnum = pgEnum("transcode_status", [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("USER"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const refreshSessionsTable = pgTable(
  "refresh_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("refresh_sessions_token_hash_idx").on(table.tokenHash),
    index("refresh_sessions_user_revoked_idx").on(table.userId, table.revokedAt),
  ],
);

export const artistsTable = pgTable(
  "artists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    bio: text("bio"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("artists_slug_idx").on(table.slug)],
);

export const albumsTable = pgTable(
  "albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    artistId: uuid("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
    releaseYear: integer("release_year"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("albums_slug_idx").on(table.slug)],
);

export const mediaTable = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: mediaTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    status: mediaStatusEnum("status").notNull().default("DRAFT"),
    durationMs: integer("duration_ms"),
    albumId: uuid("album_id").references(() => albumsTable.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_slug_idx").on(table.slug),
    index("media_status_published_at_idx").on(
      table.status,
      table.publishedAt.desc(),
      table.id.desc(),
    ),
    index("media_status_created_at_idx").on(table.status, table.createdAt.desc(), table.id.desc()),
  ],
);

export const mediaArtistsTable = pgTable(
  "media_artists",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistsTable.id, { onDelete: "cascade" }),
    role: artistRoleEnum("role").notNull().default("MAIN"),
  },
  (table) => [
    primaryKey({ columns: [table.mediaId, table.artistId] }),
    index("media_artists_artist_id_idx").on(table.artistId),
  ],
);

export const favoritesTable = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaId] }),
    index("favorites_media_id_idx").on(table.mediaId),
  ],
);

export const playlistsTable = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("playlists_owner_updated_idx").on(table.ownerId, table.updatedAt.desc())],
);

export const playlistItemsTable = pgTable(
  "playlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlistsTable.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("playlist_items_playlist_media_idx").on(table.playlistId, table.mediaId),
    index("playlist_items_playlist_position_idx").on(table.playlistId, table.position),
  ],
);

export const playbackSessionsTable = pgTable(
  "playback_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id, { onDelete: "cascade" }),
    lastSequence: integer("last_sequence").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [index("playback_sessions_user_media_idx").on(table.userId, table.mediaId)],
);

export const playbackProgressTable = pgTable(
  "playback_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id, { onDelete: "cascade" }),
    positionMs: integer("position_ms").notNull().default(0),
    lastSequence: integer("last_sequence").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaId] }),
    index("playback_progress_user_updated_idx").on(table.userId, table.updatedAt.desc()),
  ],
);

export const uploadSessionsTable = pgTable(
  "upload_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => mediaTable.id, { onDelete: "cascade" }),
    objectKey: varchar("object_key", { length: 255 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    expectedSize: bigint("expected_size", { mode: "bigint" }).notNull(),
    status: uploadSessionStatusEnum("status").notNull().default("UPLOADING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("upload_sessions_object_key_idx").on(table.objectKey),
    index("upload_sessions_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const mediaAssetsTable = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id, { onDelete: "cascade" }),
    kind: assetKindEnum("kind").notNull(),
    objectKey: varchar("object_key", { length: 255 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    checksum: varchar("checksum", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_assets_object_key_idx").on(table.objectKey),
    uniqueIndex("media_assets_media_kind_key_idx").on(table.mediaId, table.kind, table.objectKey),
  ],
);

export const transcodeJobsTable = pgTable(
  "transcode_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id, { onDelete: "cascade" }),
    sourceAssetId: uuid("source_asset_id")
      .notNull()
      .references(() => mediaAssetsTable.id, { onDelete: "cascade" }),
    profileVersion: integer("profile_version").notNull().default(1),
    status: transcodeStatusEnum("status").notNull().default("QUEUED"),
    progressPercent: integer("progress_percent").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("transcode_jobs_media_asset_profile_idx").on(
      table.mediaId,
      table.sourceAssetId,
      table.profileVersion,
    ),
    index("transcode_jobs_status_created_idx").on(table.status, table.createdAt),
  ],
);

export type UserSelect = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
export type RefreshSessionSelect = typeof refreshSessionsTable.$inferSelect;
export type RefreshSessionInsert = typeof refreshSessionsTable.$inferInsert;
export type ArtistSelect = typeof artistsTable.$inferSelect;
export type ArtistInsert = typeof artistsTable.$inferInsert;
export type AlbumSelect = typeof albumsTable.$inferSelect;
export type AlbumInsert = typeof albumsTable.$inferInsert;
export type MediaSelect = typeof mediaTable.$inferSelect;
export type MediaInsert = typeof mediaTable.$inferInsert;
export type MediaArtistSelect = typeof mediaArtistsTable.$inferSelect;
export type MediaArtistInsert = typeof mediaArtistsTable.$inferInsert;
export type FavoriteSelect = typeof favoritesTable.$inferSelect;
export type FavoriteInsert = typeof favoritesTable.$inferInsert;
export type PlaylistSelect = typeof playlistsTable.$inferSelect;
export type PlaylistInsert = typeof playlistsTable.$inferInsert;
export type PlaylistItemSelect = typeof playlistItemsTable.$inferSelect;
export type PlaylistItemInsert = typeof playlistItemsTable.$inferInsert;
export type PlaybackSessionSelect = typeof playbackSessionsTable.$inferSelect;
export type PlaybackSessionInsert = typeof playbackSessionsTable.$inferInsert;
export type PlaybackProgressSelect = typeof playbackProgressTable.$inferSelect;
export type PlaybackProgressInsert = typeof playbackProgressTable.$inferInsert;
export type UploadSessionSelect = typeof uploadSessionsTable.$inferSelect;
export type UploadSessionInsert = typeof uploadSessionsTable.$inferInsert;
export type MediaAssetSelect = typeof mediaAssetsTable.$inferSelect;
export type MediaAssetInsert = typeof mediaAssetsTable.$inferInsert;
export type TranscodeJobSelect = typeof transcodeJobsTable.$inferSelect;
export type TranscodeJobInsert = typeof transcodeJobsTable.$inferInsert;
