import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("monitoring infrastructure contains Prometheus scrape config, alerts, and Grafana dashboard", () => {
  const promPath = path.resolve("infra/monitoring/prometheus.yml");
  const alertsPath = path.resolve("infra/monitoring/alerts.yml");
  const dashPath = path.resolve("infra/monitoring/dashboards/streamflow-overview.json");

  assert.ok(fs.existsSync(promPath), "prometheus.yml must exist");
  assert.ok(fs.existsSync(alertsPath), "alerts.yml must exist");
  assert.ok(fs.existsSync(dashPath), "streamflow-overview.json must exist");

  // 1. Prometheus Scrape Configuration
  const promContent = fs.readFileSync(promPath, "utf-8");
  assert.match(promContent, /job_name:\s*["']?streamflow-api["']?/);
  assert.match(promContent, /metrics_path:\s*["']?\/metrics["']?/);

  // 2. Alert Rules
  const alertsContent = fs.readFileSync(alertsPath, "utf-8");
  assert.match(alertsContent, /alert:\s*HighErrorRate/);
  assert.match(alertsContent, /alert:\s*HighP95Latency/);
  assert.match(alertsContent, /alert:\s*DatabasePoolSaturation/);
  assert.match(alertsContent, /alert:\s*QueueLagHigh/);

  // 3. Grafana Dashboard JSON
  const dashContent = fs.readFileSync(dashPath, "utf-8");
  const parsedDash = JSON.parse(dashContent);
  assert.ok(parsedDash.title.includes("StreamFlow"), "Dashboard title must mention StreamFlow");
  assert.ok(Array.isArray(parsedDash.panels), "Dashboard must contain panels array");
  assert.ok(
    parsedDash.panels.length >= 4,
    "Dashboard must contain at least 4 visualization panels",
  );
});
