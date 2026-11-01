import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("api.Dockerfile contains expected multi-stage build instructions", () => {
  const dockerfilePath = path.resolve("infra/docker/api.Dockerfile");
  assert.ok(fs.existsSync(dockerfilePath), "infra/docker/api.Dockerfile must exist");

  const content = fs.readFileSync(dockerfilePath, "utf-8");

  // Stages
  assert.match(content, /FROM\s+node:22-alpine\s+AS\s+base/i);
  assert.match(content, /FROM\s+base\s+AS\s+builder/i);
  assert.match(content, /FROM\s+base\s+AS\s+runner/i);

  // Production environment & user
  assert.match(content, /ENV\s+NODE_ENV=production/i);
  assert.match(content, /EXPOSE\s+3000/i);
  assert.match(content, /CMD\s+\[/i);
});
