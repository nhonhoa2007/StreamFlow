import crypto from "node:crypto";

export function validateObjectKey(key) {
  if (!key || typeof key !== "string") {
    throw new Error("Invalid object key: key must be a non-empty string");
  }
  if (key.includes("..") || key.includes("\0") || key.startsWith("/") || key.includes("\\")) {
    throw new Error("Security Violation: Path traversal detected in object key");
  }
  return true;
}

export function generatePresignedUrl(basePath, params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys.map((k) => `${k}=${encodeURIComponent(params[k])}`).join("&");
  const stringToSign = `${basePath}?${canonicalQuery}`;
  const signature = crypto.createHmac("sha256", secret).update(stringToSign).digest("hex");
  return `${basePath}?${canonicalQuery}&X-Signature=${signature}`;
}

export function verifyPresignedUrl(fullUrl, secret) {
  const url = new URL(fullUrl, "http://localhost");
  const providedSignature = url.searchParams.get("X-Signature");
  if (!providedSignature) return false;

  url.searchParams.delete("X-Signature");
  const params = {};
  for (const [k, v] of url.searchParams.entries()) {
    params[k] = v;
  }
  const expectedUrl = generatePresignedUrl(url.pathname, params, secret);
  const expectedSignature = new URL(expectedUrl, "http://localhost").searchParams.get(
    "X-Signature",
  );

  const bufProvided = Buffer.from(providedSignature);
  const bufExpected = Buffer.from(expectedSignature);
  if (bufProvided.length !== bufExpected.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufProvided, bufExpected);
}
