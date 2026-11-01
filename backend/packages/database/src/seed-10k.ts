import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cleanConnectionString } from "./client.js";
import { mediaTable } from "./schema.js";

function tryLoadEnv(): void {
  if (typeof process.loadEnvFile === "function") {
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../../.env"),
      path.resolve(process.cwd(), "../../../.env"),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          process.loadEnvFile(file);
          break;
        } catch {
          // ignore
        }
      }
    }
  }
}

export async function runSeed10k(connectionString: string): Promise<void> {
  const cleanedUrl = cleanConnectionString(connectionString);
  const client = postgres(cleanedUrl, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding 10,000 synthetic media items...");
  const baseTime = new Date("2026-01-01T00:00:00Z").getTime();
  const batchSize = 500;

  try {
    for (let batch = 0; batch < 20; batch++) {
      const rows: (typeof mediaTable.$inferInsert)[] = [];
      for (let i = 0; i < batchSize; i++) {
        const index = batch * batchSize + i + 1;
        const publishedAt = new Date(baseTime + index * 1000);
        rows.push({
          type: index % 2 === 0 ? "VIDEO" : "AUDIO",
          title: `Synthetic Media Item #${index.toString().padStart(5, "0")}`,
          slug: `synthetic-item-${index.toString().padStart(5, "0")}`,
          status: "READY",
          durationMs: 120000 + (index % 300) * 1000,
          publishedAt,
        });
      }
      await db.insert(mediaTable).values(rows).onConflictDoNothing();
      process.stdout.write(`\rProgress: ${(batch + 1) * batchSize} / 10,000 items inserted`);
    }
    console.log("\n10,000 items seeded successfully.");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  tryLoadEnv();
  const url = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/streamflow";
  runSeed10k(url)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("10k seed failed:", err);
      process.exit(1);
    });
}
