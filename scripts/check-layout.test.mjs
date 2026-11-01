import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(".");

const FUTURE_LEAF_DIRS = [
  "backend/packages/testing",
  "infra/kubernetes",
  "infra/monitoring",
  "infra/terraform",
  "docs/postmortems",
  "scripts/smoke",
];

const REQUIRED_ROOT_FILES = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "biome.json",
  "tsconfig.base.json",
  "Makefile",
  ".env.example",
  "infra/compose/compose.yaml",
];

test("required root files and configs exist", () => {
  for (const file of REQUIRED_ROOT_FILES) {
    const fullPath = path.join(ROOT, file);
    assert.ok(fs.existsSync(fullPath), `Missing required file: ${file}`);
  }
});

test("future-stage leaf directories exist and contain only .gitkeep", () => {
  for (const relDir of FUTURE_LEAF_DIRS) {
    const fullDir = path.join(ROOT, relDir);
    assert.ok(fs.existsSync(fullDir), `Directory does not exist: ${relDir}`);

    const entries = fs.readdirSync(fullDir);
    assert.deepEqual(
      entries,
      [".gitkeep"],
      `Directory ${relDir} should contain only .gitkeep but has: ${entries.join(", ")}`,
    );

    // Must not have package.json in future leaves
    assert.ok(
      !fs.existsSync(path.join(fullDir, "package.json")),
      `Future leaf must not have package.json: ${relDir}`,
    );
  }
});

test("pnpm-workspace.yaml declares expected workspace globs", () => {
  const wsPath = path.join(ROOT, "pnpm-workspace.yaml");
  assert.ok(fs.existsSync(wsPath), "Missing pnpm-workspace.yaml");
  const content = fs.readFileSync(wsPath, "utf-8");
  assert.match(content, /backend\/apps\/\*/);
  assert.match(content, /backend\/packages\/\*/);
  assert.match(content, /frontend\/apps\/\*/);
  assert.match(content, /shared\/\*/);
});
