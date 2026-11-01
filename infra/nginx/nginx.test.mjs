import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("nginx configuration contains required upstream and proxy directives", () => {
  const configPath = path.resolve("infra/nginx/nginx.conf");
  assert.ok(fs.existsSync(configPath), "infra/nginx/nginx.conf must exist");

  const content = fs.readFileSync(configPath, "utf-8");

  // Upstream pooling & keepalive
  assert.match(content, /upstream\s+api_cluster\s+\{/i);
  assert.match(content, /keepalive\s+32;/i);

  // Proxy headers & ID preservation
  assert.match(content, /map\s+\$http_x_request_id\s+\$req_id/i);
  assert.match(content, /proxy_set_header\s+X-Request-ID\s+\$req_id;/i);
  assert.match(content, /proxy_set_header\s+Host\s+\$host;/i);
  assert.match(content, /proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/i);
  assert.match(content, /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;/i);

  // Passive failover
  assert.match(content, /proxy_next_upstream\s+error\s+timeout\s+http_502\s+http_503;/i);
  assert.match(content, /proxy_connect_timeout\s+2s;/i);
});
