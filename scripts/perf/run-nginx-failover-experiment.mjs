import http from "node:http";
import net from "node:net";

function calculatePercentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    max: sorted[sorted.length - 1] || 0,
    mean: sorted.reduce((sum, v) => sum + v, 0) / (sorted.length || 1),
  };
}

async function findPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export async function runNginxFailoverExperiment() {
  console.log("=== StreamFlow M08 NGINX Stateless Failover Experiment ===");

  const port1 = await findPort();
  const port2 = await findPort();
  const proxyPort = await findPort();

  let api1Requests = 0;
  let api2Requests = 0;
  let server1Alive = true;

  // Upstream 1: API Replica 1
  const server1 = http.createServer((req, res) => {
    api1Requests++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ server: "api-1", url: req.url }));
  });
  await new Promise((r) => server1.listen(port1, "127.0.0.1", r));

  // Upstream 2: API Replica 2
  const server2 = http.createServer((req, res) => {
    api2Requests++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ server: "api-2", url: req.url }));
  });
  await new Promise((r) => server2.listen(port2, "127.0.0.1", r));

  // L7 Reverse Proxy with Round-Robin and proxy_next_upstream retry
  let rrIndex = 0;
  let failoverCount = 0;

  const upstreams = [
    { name: "api-1", port: port1 },
    { name: "api-2", port: port2 },
  ];

  const proxy = http.createServer(async (req, res) => {
    const primaryIndex = rrIndex++ % upstreams.length;
    const targets = [
      upstreams[primaryIndex],
      upstreams[(primaryIndex + 1) % upstreams.length],
    ];

    let success = false;
    let attempts = 0;

    for (const target of targets) {
      attempts++;
      try {
        await new Promise((resolve, reject) => {
          const clientReq = http.request(
            {
              host: "127.0.0.1",
              port: target.port,
              path: req.url,
              method: req.method,
              headers: {
                ...req.headers,
                "x-forwarded-for": req.socket.remoteAddress,
                "x-forwarded-proto": "http",
                "x-request-id": req.headers["x-request-id"] || `req-${Date.now()}-${Math.random()}`,
              },
              timeout: 1000,
            },
            (clientRes) => {
              if (clientRes.statusCode >= 500) {
                return reject(new Error(`Upstream returned ${clientRes.statusCode}`));
              }
              res.writeHead(clientRes.statusCode, clientRes.headers);
              clientRes.pipe(res);
              clientRes.on("end", resolve);
            },
          );

          clientReq.on("error", reject);
          clientReq.on("timeout", () => {
            clientReq.destroy(new Error("Upstream timeout"));
          });
          req.pipe(clientReq);
        });

        if (attempts > 1) {
          failoverCount++;
        }
        success = true;
        break;
      } catch {
        // Transparently try next upstream (proxy_next_upstream)
      }
    }

    if (!success) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Gateway" }));
    }
  });
  await new Promise((r) => proxy.listen(proxyPort, "127.0.0.1", r));

  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  try {
    console.log(`[1/3] Starting baseline 100 RPS workload across 2 replicas...`);
    const totalRequests = 100;

    for (let i = 0; i < totalRequests; i++) {
      // Abruptly kill Replica 1 at request 40
      if (i === 40 && server1Alive) {
        console.log(`[2/3] Failure Injection: Abruptly terminating Replica 1 at request 40...`);
        server1Alive = false;
        await new Promise((r) => server1.close(r));
      }

      const start = performance.now();
      const status = await new Promise((resolve) => {
        const clientReq = http.request(
          {
            host: "127.0.0.1",
            port: proxyPort,
            path: "/v1/catalog",
            method: "GET",
          },
          (clientRes) => {
            clientRes.resume();
            clientRes.on("end", () => resolve(clientRes.statusCode));
          },
        );
        clientReq.on("error", () => resolve(500));
        clientReq.end();
      });

      const elapsed = performance.now() - start;
      latencies.push(elapsed);

      if (status === 200) {
        successfulRequests++;
      } else {
        failedRequests++;
      }
    }

    const stats = calculatePercentiles(latencies);

    console.log(`[3/3] Failover experiment completed.`);
    console.log("\n=== Failover & Availability Results ===");
    console.table([
      {
        Metric: "Total Client Requests",
        Observed: totalRequests,
        Target: 100,
      },
      {
        Metric: "Successful Responses (200 OK)",
        Observed: successfulRequests,
        Target: 100,
      },
      {
        Metric: "Failed Responses (5xx)",
        Observed: failedRequests,
        Target: 0,
      },
      {
        Metric: "Replica 1 Processed",
        Observed: api1Requests,
        Target: ">0 before termination",
      },
      {
        Metric: "Replica 2 Processed",
        Observed: api2Requests,
        Target: ">0 (absorbs 100% post-failure)",
      },
      {
        Metric: "Transparent Failover Retries",
        Observed: failoverCount,
        Target: ">0",
      },
    ]);

    console.log("\n=== Latency Profile (ms) ===");
    console.table([
      {
        p50_ms: stats.p50.toFixed(2),
        p95_ms: stats.p95.toFixed(2),
        p99_ms: stats.p99.toFixed(2),
        max_ms: stats.max.toFixed(2),
        mean_ms: stats.mean.toFixed(2),
      },
    ]);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      failoverCount,
      stats,
    };
  } finally {
    if (server1Alive) {
      await new Promise((r) => server1.close(r));
    }
    await new Promise((r) => server2.close(r));
    await new Promise((r) => proxy.close(r));
  }
}

if (process.argv[1]?.endsWith("run-nginx-failover-experiment.mjs")) {
  runNginxFailoverExperiment()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Experiment failed:", err);
      process.exit(1);
    });
}
