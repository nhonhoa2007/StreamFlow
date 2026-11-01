import {
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
