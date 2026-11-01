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

test("acceptance: M04 ADR-004 and direct upload memory experiment report exist", () => {
  const adr004Path = path.join(ROOT, "docs/adr/004-direct-object-storage-architecture.md");
  const uploadRunnerPath = path.join(ROOT, "scripts/perf/run-upload-memory-experiment.mjs");
  const uploadReportPath = path.join(ROOT, "docs/experiments/004-direct-upload-memory.md");

  assert.ok(
    fs.existsSync(adr004Path),
    "Missing docs/adr/004-direct-object-storage-architecture.md",
  );
  assert.ok(
    fs.existsSync(uploadRunnerPath),
    "Missing scripts/perf/run-upload-memory-experiment.mjs",
  );
  assert.ok(
    fs.existsSync(uploadReportPath),
    "Missing docs/experiments/004-direct-upload-memory.md",
  );

  const adrContent = fs.readFileSync(adr004Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M05 ADR-005 and transcode & ABR experiment report exist", () => {
  const adr005Path = path.join(ROOT, "docs/adr/005-hls-adaptive-streaming-architecture.md");
  const transcodeRunnerPath = path.join(ROOT, "scripts/perf/run-transcode-experiment.mjs");
  const transcodeReportPath = path.join(ROOT, "docs/experiments/005-hls-transcoding-and-abr.md");

  assert.ok(
    fs.existsSync(adr005Path),
    "Missing docs/adr/005-hls-adaptive-streaming-architecture.md",
  );
  assert.ok(
    fs.existsSync(transcodeRunnerPath),
    "Missing scripts/perf/run-transcode-experiment.mjs",
  );
  assert.ok(
    fs.existsSync(transcodeReportPath),
    "Missing docs/experiments/005-hls-transcoding-and-abr.md",
  );

  const adrContent = fs.readFileSync(adr005Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M06 ADR-006 and cache benchmark report exist", () => {
  const adr006Path = path.join(ROOT, "docs/adr/006-cache-aside-and-stampede-mitigation.md");
  const cacheRunnerPath = path.join(ROOT, "scripts/perf/run-cache-benchmark.mjs");
  const cacheReportPath = path.join(ROOT, "docs/experiments/006-cache-aside-and-stampede.md");

  assert.ok(
    fs.existsSync(adr006Path),
    "Missing docs/adr/006-cache-aside-and-stampede-mitigation.md",
  );
  assert.ok(fs.existsSync(cacheRunnerPath), "Missing scripts/perf/run-cache-benchmark.mjs");
  assert.ok(
    fs.existsSync(cacheReportPath),
    "Missing docs/experiments/006-cache-aside-and-stampede.md",
  );

  const adrContent = fs.readFileSync(adr006Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M07 ADR-007 and transcode queue experiment report exist", () => {
  const adr007Path = path.join(ROOT, "docs/adr/007-job-idempotency-and-retry-strategy.md");
  const queueRunnerPath = path.join(ROOT, "scripts/perf/run-transcode-queue-experiment.mjs");
  const queueReportPath = path.join(ROOT, "docs/experiments/007-robust-transcode-jobs.md");

  assert.ok(
    fs.existsSync(adr007Path),
    "Missing docs/adr/007-job-idempotency-and-retry-strategy.md",
  );
  assert.ok(
    fs.existsSync(queueRunnerPath),
    "Missing scripts/perf/run-transcode-queue-experiment.mjs",
  );
  assert.ok(
    fs.existsSync(queueReportPath),
    "Missing docs/experiments/007-robust-transcode-jobs.md",
  );

  const adrContent = fs.readFileSync(adr007Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M08 ADR-008, deployment diagram, and rollback runbook exist", () => {
  const adr008Path = path.join(ROOT, "docs/adr/008-nginx-reverse-proxy-and-stateless-failover.md");
  const deploymentDiagramPath = path.join(ROOT, "docs/architecture/deployment.md");
  const rollbackRunbookPath = path.join(ROOT, "docs/runbooks/deployment-and-rollback.md");
  const failoverReportPath = path.join(ROOT, "docs/experiments/008-nginx-stateless-failover.md");

  assert.ok(
    fs.existsSync(adr008Path),
    "Missing docs/adr/008-nginx-reverse-proxy-and-stateless-failover.md",
  );
  assert.ok(fs.existsSync(deploymentDiagramPath), "Missing docs/architecture/deployment.md");
  assert.ok(fs.existsSync(rollbackRunbookPath), "Missing docs/runbooks/deployment-and-rollback.md");
  assert.ok(
    fs.existsSync(failoverReportPath),
    "Missing docs/experiments/008-nginx-stateless-failover.md",
  );

  const adrContent = fs.readFileSync(adr008Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M09 ADR-009, outbox sequence diagram, and experiment report exist", () => {
  const adr009Path = path.join(ROOT, "docs/adr/009-transactional-outbox-and-event-streaming.md");
  const sequenceDiagramPath = path.join(ROOT, "docs/architecture/outbox-sequence.md");
  const experimentRunnerPath = path.join(ROOT, "scripts/perf/run-outbox-kafka-experiment.mjs");
  const experimentReportPath = path.join(
    ROOT,
    "docs/experiments/009-transactional-outbox-and-kafka.md",
  );

  assert.ok(
    fs.existsSync(adr009Path),
    "Missing docs/adr/009-transactional-outbox-and-event-streaming.md",
  );
  assert.ok(fs.existsSync(sequenceDiagramPath), "Missing docs/architecture/outbox-sequence.md");
  assert.ok(
    fs.existsSync(experimentRunnerPath),
    "Missing scripts/perf/run-outbox-kafka-experiment.mjs",
  );
  assert.ok(
    fs.existsSync(experimentReportPath),
    "Missing docs/experiments/009-transactional-outbox-and-kafka.md",
  );

  const adrContent = fs.readFileSync(adr009Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M10 ADR-010, postmortems, incident runbook, and chaos experiment exist", () => {
  const adr010Path = path.join(ROOT, "docs/adr/010-observability-slo-and-chaos-engineering.md");
  const pm1 = path.join(ROOT, "docs/postmortems/001-redis-outage-cache-degradation.md");
  const pm2 = path.join(ROOT, "docs/postmortems/002-transcode-worker-backlog-and-recovery.md");
  const pm3 = path.join(ROOT, "docs/postmortems/003-database-saturation-and-readiness-tripping.md");
  const runbook = path.join(ROOT, "docs/runbooks/incident-response.md");
  const chaosReport = path.join(ROOT, "docs/experiments/010-chaos-and-observability.md");
  const chaosRunner = path.join(ROOT, "scripts/perf/run-chaos-resiliency-experiment.mjs");

  assert.ok(
    fs.existsSync(adr010Path),
    "Missing docs/adr/010-observability-slo-and-chaos-engineering.md",
  );
  assert.ok(fs.existsSync(pm1), "Missing postmortem 001");
  assert.ok(fs.existsSync(pm2), "Missing postmortem 002");
  assert.ok(fs.existsSync(pm3), "Missing postmortem 003");
  assert.ok(fs.existsSync(runbook), "Missing incident-response.md runbook");
  assert.ok(fs.existsSync(chaosReport), "Missing docs/experiments/010-chaos-and-observability.md");
  assert.ok(fs.existsSync(chaosRunner), "Missing scripts/perf/run-chaos-resiliency-experiment.mjs");

  const adrContent = fs.readFileSync(adr010Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});

test("acceptance: M11 ADR-011, Kubernetes manifests, and scaling experiment exist", () => {
  const adr011Path = path.join(ROOT, "docs/adr/011-kubernetes-adoption-tradeoffs.md");
  const k8sManifestPath = path.join(ROOT, "infra/kubernetes/kustomization.yaml");
  const experimentRunnerPath = path.join(ROOT, "scripts/perf/run-k8s-scaling-experiment.mjs");
  const experimentReportPath = path.join(
    ROOT,
    "docs/experiments/011-kubernetes-hpa-and-rolling-updates.md",
  );

  assert.ok(fs.existsSync(adr011Path), "Missing docs/adr/011-kubernetes-adoption-tradeoffs.md");
  assert.ok(fs.existsSync(k8sManifestPath), "Missing infra/kubernetes/kustomization.yaml");
  assert.ok(
    fs.existsSync(experimentRunnerPath),
    "Missing scripts/perf/run-k8s-scaling-experiment.mjs",
  );
  assert.ok(
    fs.existsSync(experimentReportPath),
    "Missing docs/experiments/011-kubernetes-hpa-and-rolling-updates.md",
  );

  const adrContent = fs.readFileSync(adr011Path, "utf-8");
  assert.match(adrContent, /Context/i);
  assert.match(adrContent, /Decision/i);
  assert.match(adrContent, /Consequences/i);
});
