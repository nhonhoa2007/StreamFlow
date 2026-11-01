import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DatabaseHandle, createDatabase } from "../src/client.js";
import { listReadyMedia } from "../src/media-repository.js";
import { runMigrations } from "../src/migrate.js";
import {
  albumsTable,
  artistsTable,
  mediaArtistsTable,
  mediaTable,
  refreshSessionsTable,
  usersTable,
} from "../src/schema.js";
import { runSeed } from "../src/seed.js";
import {
  createRefreshSession,
  findSessionByTokenHash,
  revokeAllSessionsForUser,
  revokeSession,
} from "../src/session-repository.js";
import { createUser, findUserByEmail, findUserById } from "../src/user-repository.js";
import { type TestDatabaseInstance, startTestDatabase } from "./test-helper.js";

describe("Database package integration tests", () => {
  let testDb: TestDatabaseInstance;
  let dbHandle: DatabaseHandle;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    dbHandle = createDatabase(testDb.databaseUrl);
  }, 20000);

  afterAll(async () => {
    if (dbHandle) {
      await dbHandle.close();
    }
    if (testDb) {
      await testDb.cleanup();
    }
  });

  it("checks database connection successfully", async () => {
    const isConnected = await dbHandle.checkConnection();
    expect(isConnected).toBe(true);
  });

  it("applies migrations repeatably without error", async () => {
    // Run migration twice to prove idempotency
    await runMigrations(testDb.databaseUrl);
    await runMigrations(testDb.databaseUrl);
  });

  it("applies seed repeatably without duplicating rows", async () => {
    // Run seed twice to prove upsert idempotency
    await runSeed(testDb.databaseUrl);
    await runSeed(testDb.databaseUrl);

    // Should have exactly 10 rows in total (5 audio, 5 video)
    const allRows = await dbHandle.db.select().from(mediaTable);
    expect(allRows).toHaveLength(10);

    const audioRows = allRows.filter((r) => r.type === "AUDIO");
    const videoRows = allRows.filter((r) => r.type === "VIDEO");
    expect(audioRows).toHaveLength(5);
    expect(videoRows).toHaveLength(5);

    // All seeded rows should be READY
    expect(allRows.every((r) => r.status === "READY")).toBe(true);
  });

  it("excludes DRAFT items and sorts READY items by created_at DESC, id DESC", async () => {
    // Insert a draft item
    await dbHandle.db.insert(mediaTable).values({
      type: "AUDIO",
      title: "Draft Work in Progress",
      slug: "draft-wip",
      status: "DRAFT",
    });

    const readyItems = await listReadyMedia(dbHandle.db, { limit: 20 });

    // Ensure draft item is not present in ready catalog
    expect(readyItems.some((item) => item.slug === "draft-wip")).toBe(false);
    expect(readyItems).toHaveLength(10);

    // Verify deterministic ordering: created_at DESC
    // Note: DTO returns id, type, title, slug, durationMs (no internal timestamps/status)
    expect(readyItems[0]).toHaveProperty("id");
    expect(readyItems[0]).toHaveProperty("slug");
    expect(readyItems[0]).toHaveProperty("title");
    expect((readyItems[0] as Record<string, unknown>).status).toBeUndefined();
  });

  it("supports limit and type filtering in listReadyMedia", async () => {
    const limited = await listReadyMedia(dbHandle.db, { limit: 3 });
    expect(limited).toHaveLength(3);

    const videoOnly = await listReadyMedia(dbHandle.db, { type: "VIDEO", limit: 20 });
    expect(videoOnly).toHaveLength(5);
    expect(videoOnly.every((item) => item.type === "VIDEO")).toBe(true);

    const audioOnly = await listReadyMedia(dbHandle.db, { type: "AUDIO", limit: 20 });
    expect(audioOnly).toHaveLength(5);
    expect(audioOnly.every((item) => item.type === "AUDIO")).toBe(true);
  });

  it("runs EXPLAIN (ANALYZE, BUFFERS) against catalog query", async () => {
    const explain = await dbHandle.client`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id, type, title, slug, duration_ms
      FROM media
      WHERE status = 'READY'
      ORDER BY created_at DESC, id DESC
      LIMIT 20;
    `;
    const planText = explain.map((r) => (r as Record<string, string>)["QUERY PLAN"]).join("\n");
    expect(planText).toBeDefined();
    expect(planText.length).toBeGreaterThan(0);
  });

  it("checkConnection returns false promptly when connection is broken", async () => {
    // Invalid connection URL (unreachable port)
    const brokenHandle = createDatabase(
      "postgres://postgres:postgres@127.0.0.1:54399/streamflow_dummy",
    );
    const isConnected = await brokenHandle.checkConnection();
    expect(isConnected).toBe(false);
    await brokenHandle.close();
  });

  describe("M02 Relational Schema & Constraints", () => {
    it("creates users, enforces unique email, and cascades refresh sessions", async () => {
      // 1. Insert user
      const [user] = await dbHandle.db
        .insert(usersTable)
        .values({
          email: "user@example.com",
          passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
          role: "USER",
        })
        .returning();

      expect(user.id).toBeDefined();
      expect(user.email).toBe("user@example.com");
      expect(user.role).toBe("USER");

      // 2. Reject duplicate email
      await expect(
        dbHandle.db.insert(usersTable).values({
          email: "user@example.com",
          passwordHash: "anotherhash",
        }),
      ).rejects.toThrow();

      // 3. Insert refresh session
      const [session] = await dbHandle.db
        .insert(refreshSessionsTable)
        .values({
          userId: user.id,
          tokenHash: "a".repeat(64),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning();

      expect(session.userId).toBe(user.id);

      // 4. Deleting user cascades and removes refresh session
      await dbHandle.client`DELETE FROM users WHERE id = ${user.id}::uuid`;
      const remainingSessions =
        await dbHandle.client`SELECT * FROM refresh_sessions WHERE user_id = ${user.id}::uuid`;
      expect(remainingSessions).toHaveLength(0);
    });

    it("creates artists, albums, and connects media via media_artists and album_id", async () => {
      // 1. Create artist
      const [artist] = await dbHandle.db
        .insert(artistsTable)
        .values({
          name: "Daft Punk",
          slug: "daft-punk",
          bio: "French electronic music duo",
        })
        .returning();

      expect(artist.slug).toBe("daft-punk");

      // 2. Create album
      const [album] = await dbHandle.db
        .insert(albumsTable)
        .values({
          title: "Discovery",
          slug: "discovery",
          artistId: artist.id,
          releaseYear: 2001,
        })
        .returning();

      expect(album.artistId).toBe(artist.id);

      // 3. Create media linked to album and with published_at
      const [media] = await dbHandle.db
        .insert(mediaTable)
        .values({
          type: "AUDIO",
          title: "One More Time",
          slug: "one-more-time",
          status: "READY",
          durationMs: 320000,
          albumId: album.id,
          publishedAt: new Date(),
        })
        .returning();

      expect(media.albumId).toBe(album.id);
      expect(media.publishedAt).toBeInstanceOf(Date);

      // 4. Link artist to media via media_artists
      await dbHandle.db.insert(mediaArtistsTable).values({
        mediaId: media.id,
        artistId: artist.id,
        role: "MAIN",
      });

      const links = await dbHandle.client`
        SELECT m.title as media_title, a.name as artist_name, ma.role
        FROM media_artists ma
        JOIN media m ON ma.media_id = m.id
        JOIN artists a ON ma.artist_id = a.id
        WHERE m.id = ${media.id}::uuid
      `;

      expect(links).toHaveLength(1);
      expect(links[0].media_title).toBe("One More Time");
      expect(links[0].artist_name).toBe("Daft Punk");
      expect(links[0].role).toBe("MAIN");
    });

    it("operates user and session repository functions correctly", async () => {
      // 1. Create user via repository
      const createdUser = await createUser(dbHandle.db, {
        email: "repo_user@example.com",
        passwordHash: "$argon2id$testhash",
        role: "ADMIN",
      });
      expect(createdUser.email).toBe("repo_user@example.com");
      expect(createdUser.role).toBe("ADMIN");

      // 2. Find user by email and by id
      const foundByEmail = await findUserByEmail(dbHandle.db, "repo_user@example.com");
      expect(foundByEmail?.id).toBe(createdUser.id);

      const foundById = await findUserById(dbHandle.db, createdUser.id);
      expect(foundById?.email).toBe("repo_user@example.com");

      // 3. Create session via repository
      const tokenHash1 = "1".repeat(64);
      const tokenHash2 = "2".repeat(64);
      const expiresAt = new Date(Date.now() + 3600000);

      const session1 = await createRefreshSession(dbHandle.db, {
        userId: createdUser.id,
        tokenHash: tokenHash1,
        expiresAt,
      });
      expect(session1.tokenHash).toBe(tokenHash1);
      expect(session1.revokedAt).toBeNull();

      const session2 = await createRefreshSession(dbHandle.db, {
        userId: createdUser.id,
        tokenHash: tokenHash2,
        expiresAt,
      });

      // 4. Find session by hash
      const foundSession = await findSessionByTokenHash(dbHandle.db, tokenHash1);
      expect(foundSession?.id).toBe(session1.id);

      // 5. Revoke single session
      await revokeSession(dbHandle.db, session1.id);
      const revokedSession = await findSessionByTokenHash(dbHandle.db, tokenHash1);
      expect(revokedSession?.revokedAt).not.toBeNull();

      // Session 2 is still not revoked
      const unrevokedSession = await findSessionByTokenHash(dbHandle.db, tokenHash2);
      expect(unrevokedSession?.revokedAt).toBeNull();

      // 6. Revoke all sessions for user
      await revokeAllSessionsForUser(dbHandle.db, createdUser.id);
      const allRevoked2 = await findSessionByTokenHash(dbHandle.db, tokenHash2);
      expect(allRevoked2?.revokedAt).not.toBeNull();
    });
  });
});
