import "reflect-metadata";
import { parseApiEnv } from "@streamflow/config";
import { createDatabase } from "@streamflow/database";
import { buildApp } from "./app.module.js";

async function bootstrap() {
  const config = parseApiEnv(process.env);
  const databaseHandle = createDatabase(config.DATABASE_URL);

  const app = await buildApp(config, databaseHandle);

  const host = process.env.HOST || "0.0.0.0";

  await app.listen({
    port: config.PORT,
    host,
  });

  console.log(`StreamFlow API running on http://${host}:${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error("Failed to start StreamFlow API:", err);
  process.exit(1);
});
