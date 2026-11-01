import { createCacheClient } from "../../backend/packages/cache/dist/src/cache-client.js";

function calculatePercentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
  };
}

export async function runCacheBenchmark(
  redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379",
) {
  console.log("=== StreamFlow M06 Redis Cache-Aside & Stampede Benchmark ===");

  const cache = createCacheClient(redisUrl);
  const key = `benchmark:media:${Date.now()}`;
  let loaderCalls = 0;

  // Simulate a 5ms database query
  const dbLoader = async () => {
    loaderCalls++;
    await new Promise((r) => setTimeout(r, 5));
    return {
      id: "benchmark-media-id",
      title: "Hot Content",
      payload: "x".repeat(500),
    };
  };

  try {
    // 1. Cache MISS latency (database load)
    console.log("[1/3] Measuring 50 cold/miss requests...");
    const missLatencies = [];
    for (let i = 0; i < 50; i++) {
      await cache.del(key);
      const start = performance.now();
      await cache.getOrSetWithSingleflight(key, 60, dbLoader);
      missLatencies.push(performance.now() - start);
    }

    // 2. Cache HIT latency
    console.log("[2/3] Measuring 1000 cache hit requests...");
    const hitLatencies = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      await cache.getOrSetWithSingleflight(key, 60, dbLoader);
      hitLatencies.push(performance.now() - start);
    }

    // 3. Stampede simulation: 100 simultaneous misses
    console.log("[3/3] Launching 100 simultaneous misses on same key...");
    const stampedeKey = `${key}:stampede`;
    await cache.del(stampedeKey);
    const loaderCountBefore = loaderCalls;
    const stampedeStart = performance.now();
    const stampedeResults = await Promise.all(
      Array.from({ length: 100 }, () => cache.getOrSetWithSingleflight(stampedeKey, 60, dbLoader)),
    );
    const stampedeDuration = performance.now() - stampedeStart;
    const stampedeLoaderCalls = loaderCalls - loaderCountBefore;

    const missStats = calculatePercentiles(missLatencies);
    const hitStats = calculatePercentiles(hitLatencies);

    console.log("\n=== Cache Latency Comparison ===");
    console.table([
      {
        Scenario: "Cache MISS (DB Query)",
        Samples: missLatencies.length,
        p50_ms: missStats.p50.toFixed(3),
        p95_ms: missStats.p95.toFixed(3),
        p99_ms: missStats.p99.toFixed(3),
        mean_ms: missStats.mean.toFixed(3),
      },
      {
        Scenario: "Cache HIT (Redis)",
        Samples: hitLatencies.length,
        p50_ms: hitStats.p50.toFixed(3),
        p95_ms: hitStats.p95.toFixed(3),
        p99_ms: hitStats.p99.toFixed(3),
        mean_ms: hitStats.mean.toFixed(3),
      },
    ]);

    console.log("\n=== Stampede Defense Results ===");
    console.table([
      {
        "Concurrent Requests": stampedeResults.length,
        "DB Loader Calls": stampedeLoaderCalls,
        "Coalesced Requests": stampedeResults.length - stampedeLoaderCalls,
        "Total Duration (ms)": stampedeDuration.toFixed(3),
        "Invariant Preserved": stampedeLoaderCalls === 1 ? "YES" : "NO",
      },
    ]);

    return { missStats, hitStats, stampedeLoaderCalls, stampedeDuration };
  } finally {
    await cache.close();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runCacheBenchmark().catch((err) => {
    console.error("Benchmark failed (ensure Redis is running):", err.message);
    process.exit(1);
  });
}
