import http from "node:http";

function calculatePercentiles(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return { p50, p95, p99, max, mean: Math.round(mean * 100) / 100 };
}

async function measureRequest(url) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          const duration = performance.now() - start;
          resolve({ duration, statusCode: res.statusCode });
        });
      })
      .on("error", reject);
  });
}

export async function runExperiment(baseUrl = "http://127.0.0.1:3000") {
  console.log("=== StreamFlow Event Loop Blocking Experiment ===");
  console.log(`Target: ${baseUrl}`);

  // 1. Measure Baseline
  console.log("\n[1/2] Measuring baseline latency on /health/live (30 requests)...");
  const baselineLatencies = [];
  for (let i = 0; i < 30; i++) {
    const { duration } = await measureRequest(`${baseUrl}/health/live`);
    baselineLatencies.push(duration);
    await new Promise((r) => setTimeout(r, 20));
  }
  const baselineStats = calculatePercentiles(baselineLatencies);

  // 2. Measure Under CPU Block
  console.log("[2/2] Triggering /test/cpu-block and measuring concurrent /health/live...");
  const blockingPromise = measureRequest(`${baseUrl}/test/cpu-block`);

  const blockedLatencies = [];
  const startSend = performance.now();
  while (performance.now() - startSend < 400) {
    const reqPromise = measureRequest(`${baseUrl}/health/live`).then(({ duration }) => {
      blockedLatencies.push(duration);
    });
    await new Promise((r) => setTimeout(r, 25));
  }

  await blockingPromise;
  const blockedStats = calculatePercentiles(blockedLatencies);

  console.log("\n=== Experiment Results ===");
  console.table([
    { Scenario: "Baseline (/health/live)", ...baselineStats, Samples: baselineLatencies.length },
    { Scenario: "Under 500ms CPU Block", ...blockedStats, Samples: blockedLatencies.length },
  ]);

  return { baselineStats, blockedStats };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runExperiment().catch((err) => {
    console.error("Experiment failed (ensure API is running on port 3000):", err.message);
    process.exit(1);
  });
}
