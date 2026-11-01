import { parseApiEnv } from "@streamflow/config";
import { createDatabase } from "@streamflow/database";
import { createEventRelay } from "./relay.js";

export * from "./relay.js";

async function main() {
  const config = parseApiEnv(process.env);
  const dbHandle = createDatabase(config.DATABASE_URL);

  const relay = createEventRelay({
    dbHandle,
    topic: config.KAFKA_PLAYBACK_TOPIC,
    kafkaBrokers: [config.KAFKA_BROKERS],
  });

  const onShutdown = async () => {
    console.log("Shutting down event relay...");
    await relay.close();
    await dbHandle.close();
    process.exit(0);
  };

  process.once("SIGTERM", onShutdown);
  process.once("SIGINT", onShutdown);

  relay.start();
  console.log("StreamFlow Event Relay started.");
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  main().catch((err) => {
    console.error("Failed to start Event Relay:", err);
    process.exit(1);
  });
}
