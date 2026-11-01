import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export interface DatabaseHandle {
  db: PostgresJsDatabase<typeof schema>;
  client: postgres.Sql;
  close: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
}

export function cleanConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("schema");
    return parsed.toString();
  } catch {
    return url.replace(/[?&]schema=[^&]+/g, "");
  }
}

export function createDatabase(connectionString: string): DatabaseHandle {
  const cleanedUrl = cleanConnectionString(connectionString);
  const client = postgres(cleanedUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 2,
    onnotice: () => {},
  });

  const db = drizzle(client, { schema });

  return {
    db,
    client,
    close: async () => {
      try {
        await client.end({ timeout: 2 });
      } catch {
        // ignore error on close
      }
    },
    checkConnection: async () => {
      try {
        const queryPromise = client`SELECT 1`.simple();
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Database check timeout")), 2000);
        });

        await Promise.race([queryPromise, timeoutPromise]).finally(() => {
          clearTimeout(timer);
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
