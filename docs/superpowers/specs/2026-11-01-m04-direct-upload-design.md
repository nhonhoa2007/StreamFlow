# Milestone 04 Specification: Direct Upload & Object Storage Architecture

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M04 (Weeks 7–8)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 04 establishes the **separation of the Control Plane from the Data Plane** for binary media storage in StreamFlow:
1. **Direct-to-Storage Uploads:** The Node.js API never proxies, buffers, or streams multi-gigabyte video or audio files through process memory. Clients upload directly to Object Storage (MinIO locally, Cloudflare R2 in production) using time-limited Presigned URLs (`PUT`).
2. **Upload Session Lifecycle & State Machine:**
   - `POST /v1/admin/uploads/init`: Validates administrative authorization, MIME allowlist, and size limits. Allocates random, unguessable object keys in private buckets and issues signed URLs with short TTLs (15 minutes).
   - `POST /v1/admin/uploads/:id/complete`: Performs server-side verification using S3 `HeadObject` (validates object presence, byte size, and metadata) before transitioning state to `UPLOADED` and creating a `media_assets` record.
3. **Idempotency & Forged Complete Defense:**
   - Replaying `/complete` on an already completed upload is idempotent and returns the existing asset record without duplicating rows.
   - Forged completes (missing S3 object or size mismatch) are rejected with `400 Bad Request`.
4. **Housekeeping:** Routine cleanup of abandoned or expired upload sessions.
5. **Storage Provider Agnosticism:** Unified S3 client layer using `@aws-sdk/client-s3` that works seamlessly with local MinIO and Cloudflare R2 via configuration.
6. **Experiments & Architectural Evidence:**
   - Experiment 1: Measuring Node.js API RSS memory during a 1 GiB upload to prove memory remains flat (`O(1)` memory overhead).
   - Experiment 2: Idempotent replay and forged complete rejection verification.
7. **Architectural Decision Record (ADR-004):** Direct Object Storage Architecture.

---

## 2. Database Schema & Storage Model

All schema definitions live in `backend/packages/database/src/schema.ts`.

### 2.1 Enums
- `upload_session_status`: `'UPLOADING' | 'UPLOADED' | 'EXPIRED' | 'FAILED'`
- `asset_kind`: `'SOURCE_AUDIO' | 'SOURCE_VIDEO' | 'THUMBNAIL' | 'HLS_PLAYLIST' | 'HLS_SEGMENT'`

### 2.2 Table Definitions

#### `upload_sessions`
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `userId`: `uuid`, not null, foreign key references `users(id)` ON DELETE CASCADE.
- `mediaId`: `uuid`, nullable, foreign key references `media(id)` ON DELETE CASCADE.
- `objectKey`: `varchar(255)`, not null, unique index.
- `filename`: `varchar(255)`, not null.
- `mimeType`: `varchar(128)`, not null.
- `expectedSize`: `bigint`, not null.
- `status`: `upload_session_status`, not null, default `'UPLOADING'`.
- `expiresAt`: `timestamp with time zone`, not null.
- `createdAt`: `timestamp with time zone`, not null, default `now()`.
- `updatedAt`: `timestamp with time zone`, not null, default `now()`.
- Indices:
  - `uniqueIndex on object_key`
  - `index on (status, expires_at)` for abandoned session cleanup

#### `media_assets`
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `mediaId`: `uuid`, not null, foreign key references `media(id)` ON DELETE CASCADE.
- `kind`: `asset_kind`, not null.
- `objectKey`: `varchar(255)`, not null, unique index.
- `sizeBytes`: `bigint`, not null.
- `mimeType`: `varchar(128)`, not null.
- `checksum`: `varchar(64)`, nullable.
- `createdAt`: `timestamp with time zone`, not null, default `now()`.
- `updatedAt`: `timestamp with time zone`, not null, default `now()`.
- Indices:
  - `uniqueIndex on (media_id, kind, object_key)`
  - `uniqueIndex on object_key`

---

## 3. Shared Contracts (`shared/contracts`)

Exported from `@streamflow/contracts`:

### 3.1 Upload Schemas
- `InitUploadRequestSchema`:
  - `filename`: `z.string().min(1).max(255)`.
  - `expectedSize`: `z.number().int().positive().max(5 * 1024 * 1024 * 1024)`. (Max 5 GiB)
  - `mimeType`: `z.enum(['audio/mpeg', 'audio/wav', 'audio/flac', 'video/mp4', 'video/quicktime', 'video/webm'])`.
  - `type`: `z.enum(['AUDIO', 'VIDEO'])`.
  - `title`: `z.string().min(1).max(255)`.
- `InitUploadResponseSchema`:
  - `uploadId`: `z.string().uuid()`.
  - `mediaId`: `z.string().uuid()`.
  - `objectKey`: `z.string()`.
  - `presignedUrl`: `z.string().url()`.
  - `expiresAt`: `z.string().datetime()`.
- `CompleteUploadResponseSchema`:
  - `status`: `z.enum(['UPLOADED', 'ALREADY_COMPLETED'])`.
  - `mediaId`: `z.string().uuid()`.
  - `assetId`: `z.string().uuid()`.
  - `objectKey`: `z.string()`.
  - `sizeBytes`: `z.number()`.

---

## 4. Storage Architecture (`@streamflow/storage` / backend service)

- **S3 Client Configuration:** Uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
- Supports MinIO (local dev with `forcePathStyle: true`) and Cloudflare R2 (production).
- Generates presigned URLs with 15-minute expiration:
  ```typescript
  getSignedUrl(s3Client, new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    ContentType: mimeType,
  }), { expiresIn: 900 });
  ```
- Object Key Generation Pattern: `raw/{mediaId}/{randomBytes(16)}/{sanitizedFilename}` to prevent key collisions and path traversal attacks.

---

## 5. Endpoints Specification

All upload endpoints require `@Roles('ADMIN')`:

| Method | Route | Description |
|---|---|---|
| `POST` | `/v1/admin/uploads/init` | Initiates upload session, allocates key, signs URL |
| `POST` | `/v1/admin/uploads/:id/complete` | Verifies object presence & size via S3 HEAD, registers asset |
| `GET` | `/v1/admin/uploads/:id` | Checks status of an upload session |

---

## 6. Definition of Done
1. Database schema updated with `upload_sessions` and `media_assets`.
2. Storage service integrated with S3 API, verified with MinIO / local emulator.
3. Administrative upload flow (`/init` -> direct S3 PUT -> `/complete`) working end-to-end.
4. Idempotency verified: duplicate `/complete` calls do not duplicate records.
5. Forged complete calls rejected: non-existent S3 objects return `400 Bad Request`.
6. Experiment 1: Verification that API RSS memory remains flat during direct uploads.
7. ADR-004 documented and committed.
8. 100% passing tests, clean Biome, clean Typecheck, clean build.
