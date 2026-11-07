import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("compose.stage-b.yaml defines 2 API replicas, NGINX gateway, and backing services", () => {
  const composePath = path.resolve("infra/compose/compose.stage-b.yaml");
  assert.ok(fs.existsSync(composePath), "compose.stage-b.yaml must exist");

  const content = fs.readFileSync(composePath, "utf-8");

  // Verify services
  assert.match(content, /^\s*nginx:/m);
  assert.match(content, /^\s*api-1:/m);
  assert.match(content, /^\s*api-2:/m);
  assert.match(content, /^\s*media-worker:/m);
  assert.match(content, /^\s*postgres:/m);
  assert.match(content, /^\s*redis:/m);
  assert.match(content, /^\s*minio:/m);
  assert.match(content, /^\s*createbuckets:/m);

  // Worker must run the artifact produced by its TypeScript build and receive
  // the same object-storage contract as the API in production.
  assert.match(content, /command:\s*\["node",\s*"backend\/apps\/media-worker\/dist\/index\.js"\]/);
  assert.match(
    content,
    /STORAGE_ACCESS_KEY_ID:\s*\$\{STORAGE_ACCESS_KEY_ID:\?STORAGE_ACCESS_KEY_ID must be set\}/,
  );
  assert.match(
    content,
    /STORAGE_SECRET_ACCESS_KEY:\s*\$\{STORAGE_SECRET_ACCESS_KEY:\?STORAGE_SECRET_ACCESS_KEY must be set\}/,
  );

  // NGINX gateway port
  assert.match(content, /["']?80:80["']?/);

  // Volume & network config
  assert.match(content, /^\s*volumes:/m);
  assert.match(content, /streamflow_stage_b_pg_data:/);
  assert.match(content, /^\s*networks:/m);
});
