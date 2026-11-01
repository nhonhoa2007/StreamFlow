# StreamFlow M04 Direct Upload & Object Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement administrative direct-to-storage media uploads via presigned URLs with S3 HeadObject server-side completion verification, idempotency, and memory isolation.

**Architecture:** The Node.js API acts strictly as a Control Plane, generating signed `PUT` URLs with short TTLs and validating object metadata upon completion via S3 `HeadObject`. Binary media streams directly from clients into S3-compatible storage (MinIO locally, Cloudflare R2 in production), keeping Node.js RSS memory flat. Upload sessions track upload lifecycle states (`UPLOADING`, `UPLOADED`, `EXPIRED`, `FAILED`).

**Tech Stack:** NestJS 11 + Fastify, Drizzle ORM + postgres.js, PostgreSQL 16, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, Zod, Next.js 15, Vitest, Testcontainers, Biome.

**Spec:** `docs/superpowers/specs/2026-11-01-m04-direct-upload-design.md`

## Global Constraints

- Admin endpoints (`/v1/admin/uploads/*`) are strictly protected by `@Roles('ADMIN')`.
- All object keys follow random unguessable prefixes (`raw/{mediaId}/{randomBytes(16)}/{filename}`) to prevent collisions and path traversal.
- Upload Presigned URLs expire in 15 minutes (900 seconds).
- Calling `/complete` triggers S3 `HeadObject` to verify object existence and byte size within allowable range.
- Duplicate `/complete` calls on an already completed session must be idempotent, returning the existing asset record without duplicating rows.
- If the S3 object is missing or size differs significantly from expected, `/complete` throws `400 Bad Request`.
- All code formatted and checked via Biome with zero warnings.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Node API process memory (RSS) must remain flat during direct media uploads because binary bytes bypass Node.js (Task 6).
2. Forged complete requests where the S3 object does not exist must be rejected with 400 Bad Request (Task 4).
3. Replaying `/complete` on an already completed upload must be idempotent, returning existing media asset without error (Task 4).
4. Non-admin users must be rejected with 403 Forbidden on upload endpoints (Task 4).
5. Expired upload sessions past TTL must be flagged as EXPIRED by the cleanup service (Task 5).

---

## File Map

- `backend/packages/database/src/schema.ts`: Define `uploadSessionsTable` and `mediaAssetsTable`.
- `backend/packages/database/drizzle/`: Generated migration `0003_uploads_and_assets.sql`.
- `backend/packages/database/src/upload-repository.ts`: Data access layer for upload sessions and media assets.
- `shared/contracts/src/upload.ts`: Zod schemas for upload init, completion, and session status.
- `backend/packages/config/src/index.ts`: Storage provider configuration validation.
- `backend/apps/api/src/storage/{storage.service,storage.module}.ts`: S3 client and presigned URL generator.
- `backend/apps/api/src/upload/{upload.module,upload.controller,upload.service}.ts`: Endpoints for upload lifecycle.
- `frontend/apps/web/src/components/admin-upload.tsx`: Web client upload component.
- `scripts/perf/run-upload-memory-experiment.mjs` & `docs/experiments/004-direct-upload-memory.md`: Experiment report.
- `docs/adr/004-direct-object-storage-architecture.md`: ADR-004 documentation.

---

### Task 1: M04 Database Schema & Migrations

**Files:**
- Modify: `backend/packages/database/src/schema.ts`
- Modify: `backend/packages/database/src/index.ts`
- Create: `backend/packages/database/drizzle/0003_uploads_and_assets.sql`
- Test: `backend/packages/database/test/database.integration.test.ts`

- [ ] **Step 1: Write failing integration test for upload schema**
In `database.integration.test.ts`, assert `uploadSessionsTable` and `mediaAssetsTable` exist, enforce unique `object_key`, foreign key cascading on delete, and status enum values.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: FAIL on missing tables.

- [ ] **Step 3: Define schema in `schema.ts` & generate migration**
Add definitions for `uploadSessionStatusEnum`, `assetKindEnum`, `uploadSessionsTable`, and `mediaAssetsTable`. Run `pnpm --filter @streamflow/database db:generate`.

- [ ] **Step 4: Run integration test to verify success**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/
git commit -m "feat(database): add upload_sessions and media_assets schema tables"
```

---

### Task 2: Shared Contracts & Storage Configuration

**Files:**
- Create: `shared/contracts/src/upload.ts`
- Create: `shared/contracts/src/upload.test.ts`
- Modify: `shared/contracts/src/index.ts`
- Modify: `backend/packages/config/src/index.ts`
- Modify: `backend/packages/config/src/index.test.ts`

- [ ] **Step 1: Write failing unit tests for upload contracts and config**
In `upload.test.ts`, validate `InitUploadRequestSchema`, MIME allowlist (MP4, WebM, MP3, WAV, FLAC), and size bounds (max 5 GiB). In `config/src/index.test.ts`, test parsing storage settings (`STORAGE_ENDPOINT`, `STORAGE_BUCKET_NAME`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`).

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/contracts test && pnpm --filter @streamflow/config test`
Expected: FAIL.

- [ ] **Step 3: Implement upload schemas and config validation**
Implement Zod schemas in `shared/contracts/src/upload.ts` and re-export in `index.ts`. Add optional storage provider environment variables to `config/src/index.ts`.

- [ ] **Step 4: Run tests and typecheck to verify success**
Run: `pnpm --filter @streamflow/contracts test && pnpm --filter @streamflow/config test && pnpm --filter @streamflow/contracts build && pnpm --filter @streamflow/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add shared/contracts/ backend/packages/config/
git commit -m "feat(contracts): add upload contracts and storage environment configuration"
```

---

### Task 3: Storage Service & Presigner Integration

**Files:**
- Create: `backend/apps/api/src/storage/storage.service.ts`
- Create: `backend/apps/api/src/storage/storage.service.test.ts`
- Create: `backend/apps/api/src/storage/storage.module.ts`
- Modify: `backend/apps/api/package.json`

- [ ] **Step 1: Write failing unit test for StorageService**
In `storage.service.test.ts`, test generating presigned `PUT` URL with sanitized object keys, checking 15-minute TTL, and verifying mock `headObject` metadata call.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test`
Expected: FAIL on missing StorageService.

- [ ] **Step 3: Implement StorageService using AWS SDK v3**
Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `apps/api/package.json`. Implement `generatePresignedUploadUrl` and `verifyObjectExists`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(storage): implement s3 presigned url generator and object verification"
```

---

### Task 4: Upload Endpoints, Verification & Idempotency

**Files:**
- Create: `backend/packages/database/src/upload-repository.ts`
- Modify: `backend/packages/database/src/index.ts`
- Create: `backend/apps/api/src/upload/upload.service.ts`
- Create: `backend/apps/api/src/upload/upload.controller.ts`
- Create: `backend/apps/api/src/upload/upload.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Test: `backend/apps/api/test/upload.integration.test.ts`

- [ ] **Step 1: Write failing integration tests for Upload lifecycle**
In `upload.integration.test.ts`:
1. `POST /v1/admin/uploads/init` creates upload session, returns presignedUrl (403 for regular user, 401 unauth).
2. `POST /v1/admin/uploads/:id/complete` verifies S3 object:
   - When object exists with valid size: updates session to `UPLOADED`, creates `media_assets` row, links to media.
   - Idempotency: second call to `/complete` returns 200 with status `ALREADY_COMPLETED` without duplicate DB rows.
   - Forged complete: when S3 object does not exist, returns 400 Bad Request.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on missing upload routes.

- [ ] **Step 3: Implement upload-repository, UploadService, and UploadController**
Wire controller and service to `upload-repository` and `storage.service`.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/ backend/apps/api/
git commit -m "feat(upload): implement upload init and complete verification with idempotency"
```

---

### Task 5: Housekeeping: Abandoned Upload Session Cleanup

**Files:**
- Modify: `backend/packages/database/src/upload-repository.ts`
- Modify: `backend/apps/api/src/upload/upload.service.ts`
- Modify: `backend/apps/api/src/upload/upload.controller.ts`
- Test: `backend/apps/api/test/upload.integration.test.ts`

- [ ] **Step 1: Write failing test for session cleanup**
Add test in `upload.integration.test.ts` creating an expired upload session (`expires_at < now()`, status `UPLOADING`). Calling cleanup transitions status to `EXPIRED`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on missing cleanup method.

- [ ] **Step 3: Implement cleanup repository method and API routine**
Add `cleanupExpiredSessions()` updating sessions past `expiresAt`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/ backend/apps/api/
git commit -m "feat(upload): add cleanup routine for abandoned and expired upload sessions"
```

---

### Task 6: Web Client: Admin Direct Upload Component

**Files:**
- Create: `frontend/apps/web/src/components/admin-upload.tsx`
- Modify: `frontend/apps/web/src/components/user-menu.tsx`
- Modify: `frontend/apps/web/src/app/page.tsx`
- Test: `frontend/apps/web/src/lib/media-api.test.ts`

- [ ] **Step 1: Write failing test for direct upload API helper**
In `media-api.test.ts`, test `initUpload` and `completeUpload` client functions.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/web test`
Expected: FAIL.

- [ ] **Step 3: Implement direct upload flow in Web client**
Implement `AdminUpload` component visible to `ADMIN` users: file picker, calls `/init`, executes direct `fetch(presignedUrl, { method: "PUT", body: file })`, calls `/complete`, and refreshes catalog.

- [ ] **Step 4: Run test, typecheck, and build to verify success**
Run: `pnpm --filter @streamflow/web test && pnpm --filter @streamflow/web typecheck && pnpm --filter @streamflow/web build`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add frontend/apps/web/
git commit -m "feat(web): add admin direct-to-storage upload component"
```

---

### Task 7: Memory Isolation Experiment, ADR-004 & Acceptance

**Files:**
- Create: `scripts/perf/run-upload-memory-experiment.mjs`
- Create: `docs/experiments/004-direct-upload-memory.md`
- Create: `docs/adr/004-direct-object-storage-architecture.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M04 deliverables**
In `scripts/acceptance.test.mjs`, assert `docs/adr/004-direct-object-storage-architecture.md`, `docs/experiments/004-direct-upload-memory.md`, and memory experiment script exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement memory experiment script and documentation**
Write `run-upload-memory-experiment.mjs` comparing Node.js RSS memory before, during, and after presigned direct upload. Write ADR-004 and experiment report. Update README with M04 upload endpoints.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
Run:
```bash
git add .
git commit -m "docs: add m04 direct upload memory experiment report, adr-004, and acceptance tests"
```
