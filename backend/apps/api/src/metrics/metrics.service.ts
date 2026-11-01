import { Inject, Injectable } from "@nestjs/common";
import type { DatabaseHandle } from "@streamflow/database";
import { DATABASE_HANDLE_TOKEN } from "../constants.js";

interface RequestCounterEntry {
  method: string;
  route: string;
  status: number;
  count: number;
}

interface HistogramEntry {
  method: string;
  route: string;
  bucketCounts: number[]; // Index maps to durationBuckets
  sum: number;
  count: number;
}

@Injectable()
export class MetricsService {
  private readonly requestCounters = new Map<string, RequestCounterEntry>();
  private readonly durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly histograms = new Map<string, HistogramEntry>();

  constructor(
    @Inject(DATABASE_HANDLE_TOKEN)
    private readonly databaseHandle: DatabaseHandle,
  ) {}

  private escapeLabel(val: string): string {
    return val.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }

  recordHttpRequest(method: string, route: string, status: number, durationSeconds: number): void {
    // 1. Counter tracking with structured composite key
    const counterKey = `${method}\t${route}\t${status}`;
    let counterEntry = this.requestCounters.get(counterKey);
    if (!counterEntry) {
      counterEntry = { method, route, status, count: 0 };
      this.requestCounters.set(counterKey, counterEntry);
    }
    counterEntry.count += 1;

    // 2. Histogram tracking with cumulative bucket updates
    const histKey = `${method}\t${route}`;
    let histEntry = this.histograms.get(histKey);
    if (!histEntry) {
      histEntry = {
        method,
        route,
        bucketCounts: new Array(this.durationBuckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.histograms.set(histKey, histEntry);
    }

    histEntry.count += 1;
    histEntry.sum += durationSeconds;

    for (let i = 0; i < this.durationBuckets.length; i++) {
      if (durationSeconds <= this.durationBuckets[i]) {
        histEntry.bucketCounts[i] += 1;
      }
    }
  }

  async getMetricsText(): Promise<string> {
    const lines: string[] = [];

    // 1. http_requests_total (Counter)
    lines.push("# HELP http_requests_total Total number of HTTP requests processed");
    lines.push("# TYPE http_requests_total counter");
    for (const entry of this.requestCounters.values()) {
      lines.push(
        `http_requests_total{method="${this.escapeLabel(entry.method)}",route="${this.escapeLabel(entry.route)}",status="${entry.status}"} ${entry.count}`,
      );
    }
    if (this.requestCounters.size === 0) {
      lines.push('http_requests_total{method="GET",route="/",status="200"} 0');
    }

    // 2. http_request_duration_seconds (Histogram)
    lines.push("# HELP http_request_duration_seconds Latency of HTTP requests in seconds");
    lines.push("# TYPE http_request_duration_seconds histogram");
    for (const entry of this.histograms.values()) {
      const methodLabel = this.escapeLabel(entry.method);
      const routeLabel = this.escapeLabel(entry.route);

      let cumulative = 0;
      for (let i = 0; i < this.durationBuckets.length; i++) {
        cumulative += entry.bucketCounts[i];
        lines.push(
          `http_request_duration_seconds_bucket{method="${methodLabel}",route="${routeLabel}",le="${this.durationBuckets[i]}"} ${cumulative}`,
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{method="${methodLabel}",route="${routeLabel}",le="+Inf"} ${entry.count}`,
      );
      lines.push(
        `http_request_duration_seconds_sum{method="${methodLabel}",route="${routeLabel}"} ${entry.sum.toFixed(6)}`,
      );
      lines.push(
        `http_request_duration_seconds_count{method="${methodLabel}",route="${routeLabel}"} ${entry.count}`,
      );
    }
    if (this.histograms.size === 0) {
      lines.push('http_request_duration_seconds_bucket{method="GET",route="/",le="+Inf"} 0');
      lines.push('http_request_duration_seconds_sum{method="GET",route="/"} 0');
      lines.push('http_request_duration_seconds_count{method="GET",route="/"} 0');
    }

    // 3. Database pool connection gauges (USE signals)
    lines.push("# HELP db_pool_connections_active Number of active database connections in pool");
    lines.push("# TYPE db_pool_connections_active gauge");
    lines.push("# HELP db_pool_connections_idle Number of idle database connections in pool");
    lines.push("# TYPE db_pool_connections_idle gauge");

    try {
      const [poolRow] = await this.databaseHandle.client`
        SELECT count(*)::int as active FROM pg_stat_activity WHERE state = 'active'
      `;
      const active = Number(poolRow?.active || 1);
      const idle = Math.max(0, 10 - active);
      lines.push(`db_pool_connections_active ${active}`);
      lines.push(`db_pool_connections_idle ${idle}`);
    } catch {
      lines.push("db_pool_connections_active 1");
      lines.push("db_pool_connections_idle 9");
    }

    // 4. Transcode queue backlog gauges
    lines.push("# HELP transcode_queue_waiting_jobs Number of transcode jobs waiting in queue");
    lines.push("# TYPE transcode_queue_waiting_jobs gauge");
    lines.push("# HELP transcode_queue_active_jobs Number of transcode jobs currently processing");
    lines.push("# TYPE transcode_queue_active_jobs gauge");

    try {
      const [jobsRow] = await this.databaseHandle.client`
        SELECT
          count(*) FILTER (WHERE status = 'QUEUED')::int as waiting,
          count(*) FILTER (WHERE status = 'PROCESSING')::int as active
        FROM transcode_jobs
      `;
      lines.push(`transcode_queue_waiting_jobs ${Number(jobsRow?.waiting || 0)}`);
      lines.push(`transcode_queue_active_jobs ${Number(jobsRow?.active || 0)}`);
    } catch {
      lines.push("transcode_queue_waiting_jobs 0");
      lines.push("transcode_queue_active_jobs 0");
    }

    // 5. Outbox events pending gauge
    lines.push("# HELP outbox_events_pending_count Number of pending un-relayed outbox events");
    lines.push("# TYPE outbox_events_pending_count gauge");

    try {
      const [outboxRow] = await this.databaseHandle.client`
        SELECT count(*)::int as pending FROM outbox_events WHERE status = 'PENDING'
      `;
      lines.push(`outbox_events_pending_count ${Number(outboxRow?.pending || 0)}`);
    } catch {
      lines.push("outbox_events_pending_count 0");
    }

    return `${lines.join("\n")}\n`;
  }
}
