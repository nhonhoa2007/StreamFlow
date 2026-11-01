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
