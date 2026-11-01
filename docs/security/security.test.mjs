import assert from "node:assert";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  generatePresignedUrl,
  validateObjectKey,
  verifyJwtToken,
  verifyPresignedUrl,
} from "./security-helpers.mjs";

test("Security: path traversal attempts in object storage keys are strictly blocked", () => {
  const maliciousKeys = [
    "../etc/passwd",
    "uploads/../../secret.txt",
    "/root/confidential.mp4",
    "uploads/test\0.mp4",
    "..\\windows\\system32",
  ];

  for (const badKey of maliciousKeys) {
    assert.throws(
      () => validateObjectKey(badKey),
      /Security Violation: Path traversal detected/,
      `Key should have been blocked: ${badKey}`,
    );
  }

  // Valid safe keys must pass
  assert.ok(validateObjectKey("raw/media-123/video.mp4"));
  assert.ok(validateObjectKey("hls/media-123/720p/segment_001.ts"));
});

test("Security: HMAC signed URL tampering is detected and rejected", () => {
  const secret = "shared-secret-signing-key-32-chars!";
  const validUrl = generatePresignedUrl(
    "/raw/video.mp4",
    { expires: "1893456000", client: "app" },
    secret,
  );

  // 1. Valid signature passes
  assert.ok(verifyPresignedUrl(validUrl, secret));

  // 2. Tampered URL parameter (e.g. attacker extends expiry)
  const tamperedUrl = validUrl.replace("expires=1893456000", "expires=9999999999");
  assert.ok(!verifyPresignedUrl(tamperedUrl, secret));

  // 3. Tampered signature hash fails
  const badSigUrl = validUrl.replace(/X-Signature=[0-9a-f]+/, "X-Signature=deadbeef1234");
  assert.ok(!verifyPresignedUrl(badSigUrl, secret));

  // 4. Expired presigned URL fails
  const expiredUrl = generatePresignedUrl(
    "/raw/video.mp4",
    { expires: "1000", client: "app" },
    secret,
  );
  assert.ok(!verifyPresignedUrl(expiredUrl, secret));
});

test("Security: expired JWT tokens are rejected with jwt expired error", () => {
  const secret = "super-secret-jwt-key-with-at-least-32-chars!!";
  const expiredToken = jwt.sign(
    { sub: "11111111-1111-1111-1111-111111111111", email: "expired@test.com", role: "USER" },
    secret,
    { expiresIn: "-10s" },
  );

  const verification = verifyJwtToken(expiredToken, secret);
  assert.strictEqual(verification.valid, false);
  assert.match(verification.error || "", /jwt expired/i);
});

test("Security: STRIDE threat model documentation file exists and covers all 6 categories", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const docPath = path.resolve("docs/security/threat-model-and-hardening.md");

  assert.ok(fs.existsSync(docPath), "threat-model-and-hardening.md must exist");
  const content = fs.readFileSync(docPath, "utf-8");

  assert.match(content, /Spoofing/i);
  assert.match(content, /Tampering/i);
  assert.match(content, /Repudiation/i);
  assert.match(content, /Information Disclosure/i);
  assert.match(content, /Denial of Service/i);
  assert.match(content, /Elevation of Privilege/i);
});
