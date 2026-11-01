import { createDatabase } from "../../backend/packages/database/dist/src/client.js";
import { runMigrations } from "../../backend/packages/database/dist/src/migrate.js";
import { runSeed10k } from "../../backend/packages/database/dist/src/seed-10k.js";
import { startTestDatabase } from "../../backend/packages/database/dist/test/test-helper.js";

export async function runBenchmark(customDbUrl) {
  console.log("=== StreamFlow Keyset Cursor vs. OFFSET Benchmark ===");

  let testDbInstance = null;
  let dbUrl = customDbUrl || process.env.DATABASE_URL;

  if (!dbUrl) {
    console.log("No DATABASE_URL supplied; starting isolated PostgreSQL test instance...");
    testDbInstance = await startTestDatabase();
    dbUrl = testDbInstance.databaseUrl;
  }

  try {
    console.log("Applying migrations...");
    await runMigrations(dbUrl);

    console.log("Seeding 10,000 media records...");
    await runSeed10k(dbUrl);

    const dbHandle = createDatabase(dbUrl);

    // 1. Fetch reference item near the end to obtain a realistic cursor
    const [targetItem] = await dbHandle.client`
      SELECT id, published_at
      FROM media
      WHERE status = 'READY'
      ORDER BY published_at DESC, id DESC
      OFFSET 9980 LIMIT 1;
    `;

    console.log("\n[1/2] Running Deep OFFSET Query (OFFSET 9980 LIMIT 20)...");
    const offsetExplain = await dbHandle.client`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, type, title, slug, duration_ms
      FROM media
      WHERE status = 'READY'
      ORDER BY published_at DESC, id DESC
      OFFSET 9980 LIMIT 20;
    `;
    const offsetPlan = offsetExplain[0]["QUERY PLAN"][0];
    const offsetExecTime = offsetPlan["Execution Time"];
    const offsetBuffers =
      offsetPlan.Plan["Shared Hit Blocks"] || offsetPlan.Plan["Shared Read Blocks"] || 0;

    console.log("\n[2/2] Running Keyset Cursor Query (Index Condition Seek LIMIT 20)...");
    const keysetExplain = await dbHandle.client`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, type, title, slug, duration_ms
      FROM media
      WHERE status = 'READY'
        AND (published_at < ${targetItem.published_at} OR (published_at = ${targetItem.published_at} AND id < ${targetItem.id}::uuid))
      ORDER BY published_at DESC, id DESC
      LIMIT 20;
    `;
    const keysetPlan = keysetExplain[0]["QUERY PLAN"][0];
    const keysetExecTime = keysetPlan["Execution Time"];
    const keysetBuffers =
      keysetPlan.Plan["Shared Hit Blocks"] || keysetPlan.Plan["Shared Read Blocks"] || 0;

    console.log("\n=== Execution Plan Comparison ===");
    console.table([
      {
        Method: "OFFSET 9980 (Naive)",
        "Scan Type": offsetPlan.Plan["Node Type"],
        "Exec Time (ms)": offsetExecTime,
        "Buffers Touched": offsetBuffers,
        Complexity: "O(N)",
      },
      {
        Method: "Keyset Cursor (Index Seek)",
        "Scan Type": keysetPlan.Plan["Node Type"],
        "Exec Time (ms)": keysetExecTime,
        "Buffers Touched": keysetBuffers,
        Complexity: "O(1)",
      },
    ]);

    await dbHandle.close();
    return { offsetPlan, keysetPlan };
  } finally {
    if (testDbInstance) {
      await testDbInstance.cleanup();
    }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runBenchmark().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
  });
}
