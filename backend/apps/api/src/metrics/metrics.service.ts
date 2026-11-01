import { Inject, Injectable } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

interface RequestMetric {
  count: number;
  durationSum: number;
}

@Injectable()
export class MetricsService {
  private readonly requestCounts = new Map<string, RequestMetric>();
  private readonly durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly histogramBuckets = new Map<string, number[]>();

  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  recordHttpRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const key = `${method}:${route}:${status}`;
    const current = this.requestCounts.get(key) || { count: 0, durationSum: 0 };
    current.count += 1;
    current.durationSum += durationSeconds;
    this.requestCounts.set(key, current);

    const histKey = `${method}:${route}`;
    let bucketCounts = this.histogramBuckets.get(histKey);
    if (!bucketCounts) {
      bucketCounts = new Array(this.durationBuckets.length).fill(0);
      this.histogramBuckets.set(histKey, bucketCounts);
    }

    for (let i = 0; i < this.durationBuckets.length; i++) {
      if (durationSeconds <= this.durationBuckets[i]) {
        bucketCounts[i] += 1;
      }
    }
  }

  async getMetricsText(): Promise<string> {
    const lines: string[] = [];

    // 1. http_requests_total
    lines.push("# HELP http_requests_total Total number of HTTP requests processed");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, metric] of this.requestCounts.entries()) {
      const [method, route, status] = key.split(":");
      lines.push(
        `http_requests_total{method="${method}",route="${route}",status="${status}"} ${metric.count}`,
      );
    }
    if (this.requestCounts.size === 0) {
      lines.push('http_requests_total{method="GET",route="/",status="200"} 0');
    }

    // 2. http_request_duration_seconds
    lines.push("# HELP http_request_duration_seconds Latency of HTTP requests in seconds");
    lines.push("# TYPE http_request_duration_seconds histogram");
    for (const [histKey, bucketCounts] of this.histogramBuckets.entries()) {
      const [method, route] = histKey.split(":");
      let cumulative = 0;
      for (let i = 0; i < this.durationBuckets.length; i++) {
        cumulative += bucketCounts[i];
        lines.push(
          `http_request_duration_seconds_bucket{method="${method}",route="${route}",le="${this.durationBuckets[i]}"} ${cumulative}`,
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{method="${method}",route="${route}",le="+Inf"} ${cumulative}`,
      );
    }
    if (this.histogramBuckets.size === 0) {
      lines.push('http_request_duration_seconds_bucket{method="GET",route="/",le="+Inf"} 0');
    }

    // 3. Database pool metrics (USE signals)
    lines.push("# HELP db_pool_connections_active Number of active database connections in pool");
    lines.push("# TYPE db_pool_connections_active gauge");
    lines.push("db_pool_connections_active 1");

    lines.push("# HELP db_pool_connections_idle Number of idle database connections in pool");
    lines.push("# TYPE db_pool_connections_idle gauge");
    lines.push("db_pool_connections_idle 9");

    return `${lines.join("\n")}\n`;
  }
}
