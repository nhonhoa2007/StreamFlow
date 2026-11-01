import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export function getMigrationsFolder(): string {
  const localDrizzle = path.resolve(__dirname, "../drizzle");
  if (fs.existsSync(localDrizzle)) {
    return localDrizzle;
  }
  const distParentDrizzle = path.resolve(__dirname, "../../drizzle");
  if (fs.existsSync(distParentDrizzle)) {
    return distParentDrizzle;
  }
  return localDrizzle;
}

export async function runMigrations(connectionString: string): Promise<void> {
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    const migrationsFolder = getMigrationsFolder();
    await migrate(db, { migrationsFolder });
  } finally {
    await migrationClient.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  tryLoadEnv();
  const url = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/streamflow";
  runMigrations(url)
    .then(() => {
      console.log("Migrations applied successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
