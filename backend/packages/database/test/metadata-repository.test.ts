import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  mediaTable,
  runMigrations,
  updateMediaClassification,
} from "../src/index.js";
import { type TestDatabaseInstance, startTestDatabase } from "./test-helper.js";

describe("media classification repository", () => {
  let testDb: TestDatabaseInstance;
  let handle: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    await runMigrations(testDb.databaseUrl);
    handle = createDatabase(testDb.databaseUrl);
  }, 25000);

  afterAll(async () => {
    await handle?.close();
    await testDb?.cleanup();
  });

  it("round-trips normalized metadata and labels, including empty labels", async () => {
    const [media] = await handle.db
      .insert(mediaTable)
      .values({ type: "VIDEO", title: "Metadata", slug: `metadata-${Date.now()}` })
      .returning();
    const metadata = { version: 1 as const, container: "mp4", tags: { genre: "rock" } };
    await updateMediaClassification(handle.db, media.id, metadata, ["video-hd", "rock"]);
    const [updated] =
      await handle.client`SELECT metadata, classification_labels FROM media WHERE id = ${media.id}::uuid`;
    expect(updated.metadata).toEqual(metadata);
    expect(updated.classification_labels).toEqual(["video-hd", "rock"]);

    await updateMediaClassification(handle.db, media.id, metadata, []);
    const [empty] =
      await handle.client`SELECT metadata, classification_labels FROM media WHERE id = ${media.id}::uuid`;
    expect(empty.metadata).toEqual(metadata);
    expect(empty.classification_labels).toEqual([]);

    await updateMediaClassification(handle.db, media.id, metadata, []);
    const [stable] =
      await handle.client`SELECT metadata, classification_labels FROM media WHERE id = ${media.id}::uuid`;
    expect(stable).toEqual(empty);
  });
});
