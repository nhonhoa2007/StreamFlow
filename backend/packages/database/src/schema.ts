import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", ["AUDIO", "VIDEO"]);
export const mediaStatusEnum = pgEnum("media_status", ["DRAFT", "READY"]);

export const mediaTable = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: mediaTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    status: mediaStatusEnum("status").notNull().default("DRAFT"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_slug_idx").on(table.slug),
    index("media_status_created_at_idx").on(table.status, table.createdAt.desc(), table.id.desc()),
  ],
);

export type MediaSelect = typeof mediaTable.$inferSelect;
export type MediaInsert = typeof mediaTable.$inferInsert;
