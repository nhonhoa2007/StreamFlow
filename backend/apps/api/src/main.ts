import "reflect-metadata";
import { parseApiEnv } from "@streamflow/config";
import { createDatabase } from "@streamflow/database";
import { buildApp } from "./app.module.js";

async function bootstrap() {
  const config = parseApiEnv(process.env);
  const databaseHandle = createDatabase(config.DATABASE_URL);

  const app = await buildApp(config, databaseHandle);

  await app.listen({
    port: config.PORT,
    host: "127.0.0.1",
  });

  console.log(`StreamFlow API running on http://127.0.0.1:${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error("Failed to start StreamFlow API:", err);
  process.exit(1);
});
