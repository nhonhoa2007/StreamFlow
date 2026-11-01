# ADR-004: Direct-to-Storage Media Upload Architecture

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

In Video on Demand (VOD) systems, incoming media source files are large (ranging from 100 MB for short clips up to 5 GiB for high-bitrate 4K films). Two upload models were evaluated:

1. **Option A: Backend Proxy Streaming (`POST /api/upload` via Node.js):**
   - Node API accepts incoming multipart streams and pipe-forwards them to S3/R2.
   - *Downside:* Saturates Node.js network sockets, risks process memory bloat/OOM, doubles server egress/ingress costs, and couples API uptime to long client upload durations.
2. **Option B: Direct Upload via Presigned URLs (`PUT` directly to Object Storage):**
   - The API generates a time-limited presigned S3 `PUT` URL.
   - The browser streams binary chunks directly into the storage bucket.
   - Upon upload completion, the client notifies the API, which validates the object with S3 `HeadObject` before registering metadata.

---

## Decision

We decide on **Option B (Direct-to-Storage Upload Architecture)**:
1. **Decoupled Control and Data Planes:**
   - The Node.js API acts exclusively as a Control Plane: authentication, quota validation, random object key generation, and upload session tracking.
   - The Object Store (MinIO in local development, Cloudflare R2 in production) handles the heavy Data Plane.
2. **Short-Lived Signed URLs:**
   - Presigned `PUT` URLs are restricted to a 15-minute (900 seconds) expiration window.
   - Object keys follow unguessable random paths: `raw/{mediaId}/{randomBytes(16)}/{filename}` to eliminate key collision and path traversal vulnerabilities.
3. **Server-Side Verification on Complete:**
   - The client must call `POST /v1/admin/uploads/:id/complete`.
   - The server issues a fast S3 `HeadObjectCommand` to verify object presence, byte size, and MIME headers before marking the session `UPLOADED` and creating `media_assets`.
4. **Idempotency Guarantee:**
   - Multiple invocations of `/complete` on the same session return status `ALREADY_COMPLETED` without duplicate asset insertion.
5. **Periodic Session Cleanup:**
   - Abandoned upload sessions that pass `expiresAt` without completion are transitioned to `EXPIRED`.

---

## Consequences

### Positive
- **Process Memory Safety:** Zero risk of V8 heap exhaustion from large file uploads. API RSS memory remains flat.
- **Cost Reduction:** Cloudflare R2 charges $0 for egress, and direct browser uploads eliminate server ingress bandwidth fees.
- **Resilience:** Slow client networks or interrupted uploads do not tie up backend worker threads or socket connections.

### Negative / Tradeoffs
- **CORS Configuration:** Object storage buckets must be configured with an explicit CORS policy allowing HTTP `PUT` methods from the web origin.
- **Two-Step Client Flow:** The client must coordinate two API requests (`/init` and `/complete`) surrounding the direct binary upload.
