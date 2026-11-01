import { parseApiEnv } from "@streamflow/config";
import { createDatabase } from "@streamflow/database";
import { createTranscodeWorker, registerGracefulShutdown } from "./worker.js";

export * from "./probe.util.js";
export * from "./ladder.util.js";
export * from "./ffmpeg.util.js";
export * from "./transcode-pipeline.js";
export * from "./worker.js";

async function main() {
  const config = parseApiEnv(process.env);
  const dbHandle = createDatabase(config.DATABASE_URL);

  const workerHandle = createTranscodeWorker({
    redisUrl: config.REDIS_URL,
    queueName: config.TRANSCODE_QUEUE_NAME,
    concurrency: config.TRANSCODE_CONCURRENCY,
    dbHandle,
  });

  registerGracefulShutdown(workerHandle);
  console.log("StreamFlow Media Worker started.");
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  main().catch((err) => {
    console.error("Failed to start Media Worker:", err);
    process.exit(1);
  });
}
