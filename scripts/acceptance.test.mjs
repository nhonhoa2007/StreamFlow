import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(".");

test("acceptance: README exists and documents clean-checkout commands", () => {
  const readmePath = path.join(ROOT, "README.md");
  assert.ok(fs.existsSync(readmePath), "Missing README.md");
  const content = fs.readFileSync(readmePath, "utf-8");
  assert.match(content, /make init/);
  assert.match(content, /make dev/);
  assert.match(content, /make up/);
  assert.match(content, /make up-storage/);
});

test("acceptance: C4 architecture diagrams and ADR-001 exist", () => {
  const contextPath = path.join(ROOT, "docs/architecture/context.md");
  const containerPath = path.join(ROOT, "docs/architecture/container.md");
  const adrPath = path.join(ROOT, "docs/adr/001-modular-monolith.md");

  assert.ok(fs.existsSync(contextPath), "Missing docs/architecture/context.md");
  assert.ok(fs.existsSync(containerPath), "Missing docs/architecture/container.md");
  assert.ok(fs.existsSync(adrPath), "Missing docs/adr/001-modular-monolith.md");

  const adrContent = fs.readFileSync(adrPath, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: CI workflow exists and runs check, typecheck, test, build", () => {
  const ciPath = path.join(ROOT, ".github/workflows/ci.yml");
  assert.ok(fs.existsSync(ciPath), "Missing .github/workflows/ci.yml");
  const content = fs.readFileSync(ciPath, "utf-8");
  assert.match(content, /pnpm check/);
  assert.match(content, /pnpm typecheck/);
  assert.match(content, /pnpm test/);
  assert.match(content, /pnpm build/);
});

test("acceptance: performance experiment runner and report exist", () => {
  const runnerPath = path.join(ROOT, "scripts/perf/run-event-loop-experiment.mjs");
  const reportPath = path.join(ROOT, "docs/experiments/001-event-loop-and-healthchecks.md");

  assert.ok(fs.existsSync(runnerPath), "Missing scripts/perf/run-event-loop-experiment.mjs");
  assert.ok(
    fs.existsSync(reportPath),
    "Missing docs/experiments/001-event-loop-and-healthchecks.md",
  );
});

test("acceptance: M02 ADR-002 and pagination benchmark report exist", () => {
  const adr002Path = path.join(ROOT, "docs/adr/002-token-and-session-strategy.md");
  const benchmarkRunnerPath = path.join(ROOT, "scripts/perf/run-pagination-benchmark.mjs");
  const benchmarkReportPath = path.join(
    ROOT,
    "docs/experiments/002-keyset-pagination-benchmark.md",
  );

  assert.ok(fs.existsSync(adr002Path), "Missing docs/adr/002-token-and-session-strategy.md");
  assert.ok(
    fs.existsSync(benchmarkRunnerPath),
    "Missing scripts/perf/run-pagination-benchmark.mjs",
  );
  assert.ok(
    fs.existsSync(benchmarkReportPath),
    "Missing docs/experiments/002-keyset-pagination-benchmark.md",
  );

  const adrContent = fs.readFileSync(adr002Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M03 ADR-003 and concurrency experiment report exist", () => {
  const adr003Path = path.join(ROOT, "docs/adr/003-concurrency-control-strategy.md");
  const concurrencyRunnerPath = path.join(ROOT, "scripts/perf/run-concurrency-experiment.mjs");
  const concurrencyReportPath = path.join(
    ROOT,
    "docs/experiments/003-concurrency-and-telemetry.md",
  );

  assert.ok(fs.existsSync(adr003Path), "Missing docs/adr/003-concurrency-control-strategy.md");
  assert.ok(
    fs.existsSync(concurrencyRunnerPath),
    "Missing scripts/perf/run-concurrency-experiment.mjs",
  );
  assert.ok(
    fs.existsSync(concurrencyReportPath),
    "Missing docs/experiments/003-concurrency-and-telemetry.md",
  );

  const adrContent = fs.readFileSync(adr003Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});
