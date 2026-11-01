# StreamFlow — STRIDE Threat Model & Security Hardening Architecture

- **Author:** StreamFlow Security & SRE Team
- **Status:** Final / Milestone 12 Capstone
- **Classification:** Internal Engineering Standard

---

## 1. Executive Summary & Security Philosophy

StreamFlow adopts a **Defense-in-Depth** security philosophy. No single layer (gateway, network perimeter, or application guard) is solely trusted to protect user data and media assets. This document analyzes threats across the **STRIDE** taxonomy and details verified architectural counter-measures.

---

## 2. STRIDE Threat Analysis & Mitigations

### 2.1 S — Spoofing Identity
- **Threat Vector:** An attacker crafts counterfeit authentication tokens or attempts user impersonation to access private playlists, libraries, or administrative media endpoints.
- **Architectural Mitigation:**
  - **Argon2id Hashing:** Password hashes generated with strict memory-hard Argon2id parameters, preventing GPU/ASIC rainbow table attacks.
  - **Cryptographic JWTs:** Access tokens signed via HMAC-SHA256 (`JWT_SECRET` with minimum 32-character entropy).
  - **HttpOnly Refresh Cookies:** Refresh tokens stored exclusively in `HttpOnly`, `SameSite=Lax` cookies, neutralizing Cross-Site Scripting (XSS) token theft.
  - **Token Reuse Detection:** Centralized `refresh_sessions` tracking in PostgreSQL; if an expired or stolen refresh token is reused, all active sessions for that user are immediately revoked.

---

### 2.2 T — Tampering with Data
- **Threat Vector:**
  1. Attackers alter presigned S3 upload URLs to overwrite media objects or extend expiry times.
  2. Attackers inject path traversal characters (`../`, `..\\`, `\0`) to read or overwrite arbitrary system files in object storage.
- **Architectural Mitigation:**
  - **Deterministic Object Keys:** API generates cryptographically unique UUID object keys (`raw/${mediaId}/${uuid}.mp4`).
  - **Path Traversal Sanitization:** Object keys are validated against path traversal (`..`, `\0`, absolute slashes) before generating S3 commands or executing local worker transcoding.
  - **HMAC URL Signatures:** Presigned URLs canonicalize query parameters and sign with SHA-256 HMAC; altering expiry or bucket parameters invalidates the signature.
  - **Optimistic Concurrency Control (OCC):** Playlist items and sequence updates enforce `expectedVersion` and monotonic sequence validation to prevent race-condition data clobbering.

---

### 2.3 R — Repudiation
- **Threat Vector:** A malicious actor performs administrative media deletion or unauthorized uploads and denies the action occurred.
- **Architectural Mitigation:**
  - **Structured Audit Logging:** Every mutating request logs `X-Request-ID`, authenticated `userId`, timestamp, and action via `@streamflow/logger`.
  - **Transactional Outbox Events:** Business mutations commit events to `outbox_events` and stream to immutable Kafka topics (`media-playback-events`).

---

### 2.4 I — Information Disclosure
- **Threat Vector:**
  1. Database passwords or JWT secrets leak into application logs or client error payloads.
  2. SQL error messages or stack traces reveal database schema details during outages.
- **Architectural Mitigation:**
  - **Automatic Log Redaction:** `@streamflow/logger` automatically masks sensitive fields (`password`, `token`, `secret`, `authorization`, `cookie`, `jwt`) and sanitizes presigned URL signatures (`X-Amz-Signature=[REDACTED]`).
  - **Generic Error Responses:** Fastify exception filters swallow internal database errors during 500/503 responses, returning generic JSON (`{ "statusCode": 503, "message": "Service Unavailable" }`) without leaking database credentials or query syntax.

---

### 2.5 D — Denial of Service (DoS)
- **Threat Vector:**
  1. Cache stampedes / thundering herds overwhelm PostgreSQL on hot item expiration.
  2. CPU starvation caused by massive concurrent video transcode jobs.
  3. Slowloris or connection exhaustion against the API server.
- **Architectural Mitigation:**
  - **Singleflight In-Flight Coalescing:** Eliminates cache stampedes: 100 simultaneous misses for an item coalesce into exactly 1 database query.
  - **TTL with Jitter:** Randomizes cache expiry by ±15% to prevent synchronized mass expiration.
  - **Worker Concurrency Bounding:** Media worker strictly limits FFmpeg jobs to `concurrency: 2` to prevent CPU and OOM exhaustion.
  - **Passive Reverse Proxy Failover:** NGINX L7 proxy sheds traffic via `/health/ready` and transparently retries surviving replicas.

---

### 2.6 E — Elevation of Privilege
- **Threat Vector:** A regular authenticated user (`role: "USER"`) attempts to invoke administrative endpoints (`/v1/admin/*`) or publish media drafts.
- **Architectural Mitigation:**
  - **Declarative RBAC Guard (`RolesGuard`):** Evaluates `@Roles("ADMIN")` decorator against the decoded JWT role claim. Requests lacking the administrative role are rejected immediately with HTTP 403 Forbidden before reaching controller handlers.
  - **Non-Root Container Execution:** Production Docker containers run under dedicated unprivileged system users (`USER nestjs`, `UID 1001`) with read-only root filesystems where applicable.

---

## 3. Automated Security Verification Checklist

| Check | Tool / Verification | Status |
|---|---|---|
| Path Traversal Protection | `docs/security/security.test.mjs` | PASS |
| Presigned Signature Tamper Detection | `docs/security/security.test.mjs` | PASS |
| Log Credential Redaction | `backend/packages/logger/src/index.test.ts` | PASS |
| RBAC Endpoint Authorization | `backend/apps/api/test/rbac.integration.test.ts` | PASS |
| Token Reuse Detection | `backend/apps/api/test/auth.integration.test.ts` | PASS |
