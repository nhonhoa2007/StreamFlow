# StreamFlow M05 Media Pipeline & HLS Transcoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement asynchronous video transcoding to Adaptive Bitrate HLS (360p, 720p, 1080p) using FFmpeg, poster thumbnail extraction, atomic READY publication, and Next.js hls.js video player with quality switching.

**Architecture:** Create `backend/apps/media-worker` as a dedicated media processor. The worker probes video via `ffprobe`, derives a non-upscaling rendition ladder, executes `ffmpeg` to generate HLS segments (`.ts`) and variant playlists (`.m3u8`), extracts a 3-second thumbnail, verifies output integrity, and atomically publishes artifacts as `media_assets` and `media.status = 'READY'`. The frontend web client plays HLS streams using `hls.js` with quality switching and seek.

**Tech Stack:** FFmpeg / ffprobe 9+, NestJS 11 + Fastify, Drizzle ORM + postgres.js, PostgreSQL 16, `@aws-sdk/client-s3`, `hls.js`, Next.js 15, Vitest, Testcontainers, Biome.

**Spec:** `docs/superpowers/specs/2026-11-01-m05-media-pipeline-design.md`

## Global Constraints

- Strict **No-Upscaling Invariant**: A video source of 720p height generates 720p and 360p renditions, but never a 1080p rendition.
- All media processing runs in the worker process (`apps/media-worker`), never in the API control plane (`apps/api`).
- HLS segment duration is 4 seconds with keyframes aligned (`-g 48 -keyint_min 48 -sc_threshold 0`).
- A thumbnail poster is extracted at the 3-second mark of the video.
- Transcode failures (corrupted input, missing file) mark the job `FAILED` and never publish partial or broken outputs.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Rendition ladder derivation must reject upscaling (e.g., 720p source must not produce a 1080p rendition) (Task 3).
2. Transcoding an invalid/corrupted file must transition job status to FAILED and leave media unpublished (Task 4).
3. Manifest generation must produce valid master.m3u8 linking variant playlists with bandwidth tags (Task 3).
4. Calling `/v1/playback/:id/manifest` for a non-READY media item must return 404 (Task 5).
5. Web HLS player must fall back to native video playback if `hls.js` is not supported (Safari/iOS) (Task 6).

---

## File Map

- `backend/packages/database/src/schema.ts`: Define `transcodeStatusEnum` and `transcodeJobsTable`.
- `backend/packages/database/drizzle/`: Generated migration `0004_transcode_jobs.sql`.
- `backend/packages/database/src/transcode-repository.ts`: Data access layer for transcode jobs.
- `shared/contracts/src/pipeline.ts`: Schemas for transcode jobs, rendition profiles, and playback manifest.
- `backend/apps/media-worker/package.json`: Worker manifest.
- `backend/apps/media-worker/src/{probe.util,ladder.util,transcoder,worker}.ts`: Core transcoding engine.
- `backend/apps/api/src/playback/{playback.service,playback.controller}.ts`: Manifest endpoints.
- `frontend/apps/web/src/components/video-player.tsx`: Next.js HLS player component.
- `scripts/perf/run-transcode-experiment.mjs` & `docs/experiments/005-hls-transcoding-and-abr.md`: Experiment report.
- `docs/adr/005-hls-adaptive-streaming-architecture.md`: ADR-005 documentation.

---

### Task 1: Transcode Jobs Schema & Migrations

**Files:**
- Modify: `backend/packages/database/src/schema.ts`
- Modify: `backend/packages/database/src/index.ts`
- Create: `backend/packages/database/drizzle/0004_transcode_jobs.sql`
- Test: `backend/packages/database/test/database.integration.test.ts`

- [ ] **Step 1: Write failing integration test for transcode_jobs table**
Assert `transcodeJobsTable` exists, accepts inserts, enforces foreign keys, and has unique index on `(media_id, source_asset_id, profile_version)`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: FAIL.

- [ ] **Step 3: Define schema in `schema.ts` & generate migration**
Add `transcodeStatusEnum` and `transcodeJobsTable`. Run `pnpm --filter @streamflow/database db:generate`.

- [ ] **Step 4: Run integration test to verify success**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/
git commit -m "feat(database): add transcode_jobs table and status enum"
```

---

### Task 2: Shared Contracts for Pipeline & Playback Manifest

**Files:**
- Create: `shared/contracts/src/pipeline.ts`
- Create: `shared/contracts/src/pipeline.test.ts`
- Modify: `shared/contracts/src/index.ts`

- [ ] **Step 1: Write failing unit tests for pipeline contracts**
In `pipeline.test.ts`, validate `TranscodeJobDetailSchema`, `PlaybackManifestResponseSchema`, and `RenditionProfileSchema`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/contracts test`
Expected: FAIL.

- [ ] **Step 3: Implement Zod schemas in `pipeline.ts`**
Define schemas and re-export in `index.ts`.

- [ ] **Step 4: Run test, build, and typecheck to verify success**
Run: `pnpm --filter @streamflow/contracts test && pnpm --filter @streamflow/contracts build && pnpm --filter @streamflow/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add shared/contracts/
git commit -m "feat(contracts): add pipeline and playback manifest schemas"
```

---

### Task 3: Worker Engine: Probing, Ladder & FFmpeg HLS Generator

**Files:**
- Create: `backend/apps/media-worker/package.json`
- Create: `backend/apps/media-worker/tsconfig.json`
- Create: `backend/apps/media-worker/src/probe.util.ts`
- Create: `backend/apps/media-worker/src/ladder.util.ts`
- Create: `backend/apps/media-worker/src/ffmpeg.util.ts`
- Create: `backend/apps/media-worker/src/ladder.util.test.ts`

- [ ] **Step 1: Write failing tests for rendition ladder calculation**
In `ladder.util.test.ts`:
1. 1080p source (1920x1080) -> produces 1080p, 720p, 360p.
2. 720p source (1280x720) -> produces 720p, 360p (NO 1080p upscaling).
3. 360p source (640x360) -> produces 360p only.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: FAIL.

- [ ] **Step 3: Implement probe, ladder, and FFmpeg command generator**
Implement `probeMedia`, `buildRenditionLadder` (with strict no-upscaling logic), and `generateHlsCommands`.

- [ ] **Step 4: Run tests to verify success**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/media-worker/
git commit -m "feat(worker): implement probe, rendition ladder, and ffmpeg hls utilities"
```

---

### Task 4: Transcoding Pipeline Execution & Atomic READY Publication

**Files:**
- Create: `backend/packages/database/src/transcode-repository.ts`
- Modify: `backend/packages/database/src/index.ts`
- Create: `backend/apps/media-worker/src/transcode-pipeline.ts`
- Create: `backend/apps/media-worker/test/transcode-pipeline.test.ts`

- [ ] **Step 1: Write failing integration test for transcode pipeline**
In `transcode-pipeline.test.ts`:
1. Transcoding sample synthetic MP4 generates valid master.m3u8, variant playlists, ts segments, and thumbnail.
2. Atomically marks job COMPLETED and media READY.
3. Transcoding invalid/corrupted file fails gracefully, marks job FAILED, and leaves media DRAFT.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: FAIL.

- [ ] **Step 3: Implement transcode pipeline and repository**
Implement `transcode-repository.ts` and `transcode-pipeline.ts`.

- [ ] **Step 4: Run tests to verify success**
Run: `pnpm --filter @streamflow/media-worker test`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/ backend/apps/media-worker/
git commit -m "feat(worker): implement end-to-end transcode pipeline with atomic publication"
```

---

### Task 5: API Playback Manifest & Thumbnail Endpoints

**Files:**
- Modify: `backend/apps/api/src/playback/playback.service.ts`
- Modify: `backend/apps/api/src/playback/playback.controller.ts`
- Test: `backend/apps/api/test/playback.integration.test.ts`

- [ ] **Step 1: Write failing integration test for manifest and thumbnail endpoints**
In `playback.integration.test.ts`:
1. `GET /v1/playback/:id/manifest` on READY media returns master playlist manifest and rendition profiles.
2. `GET /v1/playback/:id/manifest` on DRAFT media returns 404 Not Found.
3. `GET /v1/playback/:id/thumbnail` returns thumbnail asset key.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL.

- [ ] **Step 3: Implement manifest retrieval in PlaybackService and PlaybackController**
Query `media_assets` for `HLS_PLAYLIST` and `THUMBNAIL`.

- [ ] **Step 4: Run test to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(playback): add manifest and thumbnail retrieval endpoints"
```

---

### Task 6: Web Client: HLS Video Player Component with Quality Selector

**Files:**
- Create: `frontend/apps/web/src/components/video-player.tsx`
- Modify: `frontend/apps/web/src/components/catalog.tsx`
- Modify: `frontend/apps/web/src/lib/media-api.ts`
- Test: `frontend/apps/web/src/lib/media-api.test.ts`

- [ ] **Step 1: Write failing test for manifest fetch API helper**
In `media-api.test.ts`, test `fetchPlaybackManifest(mediaId)`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/web test`
Expected: FAIL.

- [ ] **Step 3: Implement VideoPlayer with hls.js and quality switcher**
Add `hls.js` to `frontend/apps/web/package.json`. Implement `video-player.tsx` with level switching (Auto, 1080p, 720p, 360p), play/pause, seek bar, and Safari native HLS fallback.

- [ ] **Step 4: Run test, typecheck, and build to verify success**
Run: `pnpm --filter @streamflow/web test && pnpm --filter @streamflow/web typecheck && pnpm --filter @streamflow/web build`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add frontend/apps/web/
git commit -m "feat(web): implement hls video player with quality switching and seek"
```

---

### Task 7: Transcoding & ABR Experiments, ADR-005 & Acceptance

**Files:**
- Create: `scripts/perf/run-transcode-experiment.mjs`
- Create: `docs/experiments/005-hls-transcoding-and-abr.md`
- Create: `docs/adr/005-hls-adaptive-streaming-architecture.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M05 deliverables**
In `scripts/acceptance.test.mjs`, assert `docs/adr/005-hls-adaptive-streaming-architecture.md`, `docs/experiments/005-hls-transcoding-and-abr.md`, and transcode experiment script exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement experiment script, ADR-005, and update README**
Write `run-transcode-experiment.mjs` measuring transcoding metrics. Write ADR-005 and experiment report. Update README with M05 details.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
Run:
```bash
git add .
git commit -m "docs: add m05 transcode and abr experiment report, adr-005, and acceptance tests"
```
