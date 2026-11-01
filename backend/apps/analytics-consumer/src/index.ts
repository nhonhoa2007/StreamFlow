import { parseApiEnv } from "@streamflow/config";
import { createDatabase } from "@streamflow/database";
import { createAnalyticsConsumer } from "./consumer.js";

export * from "./consumer.js";

async function main() {
  const config = parseApiEnv(process.env);
  const dbHandle = createDatabase(config.DATABASE_URL);

  const consumer = createAnalyticsConsumer({
    dbHandle,
    topic: config.KAFKA_PLAYBACK_TOPIC,
    consumerGroup: config.KAFKA_CONSUMER_GROUP,
    kafkaBrokers: [config.KAFKA_BROKERS],
  });

  const onShutdown = async () => {
    console.log("Shutting down analytics consumer...");
    await consumer.close();
    await dbHandle.close();
    process.exit(0);
  };

  process.once("SIGTERM", onShutdown);
  process.once("SIGINT", onShutdown);

  await consumer.start();
  console.log("StreamFlow Analytics Consumer started.");
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  main().catch((err) => {
    console.error("Failed to start Analytics Consumer:", err);
    process.exit(1);
  });
}
