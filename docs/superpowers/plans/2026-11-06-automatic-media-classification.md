# Automatic Media Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify uploaded media from normalized ffprobe metadata, persist deterministic labels, expose exact-label filtering, and render labels in the StreamFlow catalog.

**Architecture:** The media worker owns file probing and a pure classifier. A metadata job handles completed source assets, while the video transcode path passes the same classification result into the existing atomic publication transaction. PostgreSQL stores bounded normalized metadata plus a GIN-indexed text label array; public APIs expose labels and accept one exact-label filter.

**Tech Stack:** TypeScript, Zod, NestJS/Fastify, BullMQ, Drizzle ORM, PostgreSQL, ffprobe, Next.js, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-automatic-media-classification-design.md`

## Global Constraints

- Classification is deterministic and metadata-driven; do not add ML or external recognition services.
- Labels are `video-4k`, `video-hd`, `video-sd`, `audio-lossless`, `audio-lossy`, plus normalized embedded `genre` values.
- Raw ffprobe output is never persisted or returned; persist only the bounded versioned metadata shape from the spec.
- Video metadata and labels must be written in the same transaction that inserts published assets and marks media `READY`.
- Classification jobs must be idempotent and safe to retry.
- Missing optional metadata yields partial or empty labels and must not crash a valid upload.
- Existing uncommitted workspace changes must remain untouched.
- Conventional Commit messages must be used for commits; do not add attribution trailers.

## Review Focus

- A media with no audio stream must not receive `audio-lossy`; test classifier output for video-only probes in Task 1.
- A 2160-pixel source must receive only `video-4k`, while 720p and SD sources receive their respective labels; test boundary dimensions in Task 1.
- Genre tags with mixed case, separators, duplicates, and unsafe characters must normalize deterministically; test this in Task 1.
- A repeated metadata job or upload completion must leave one stable metadata/label state; test worker idempotency in Task 3.
- Adding a classification filter must preserve cursor ordering and reject invalid or repeated query values; test repository/API pagination in Task 5.

---

### Task 1: Shared metadata contracts, ffprobe parsing, and pure classification

**Files:**
- Create: `shared/contracts/src/classification.ts`
- Modify: `shared/contracts/src/index.ts`
- Modify: `shared/contracts/src/media.ts`
- Create: `shared/contracts/src/classification.test.ts`
- Modify: `backend/apps/media-worker/src/probe.util.ts`
- Create: `backend/apps/media-worker/src/probe.util.test.ts`
- Create: `backend/apps/media-worker/src/classification.ts`
- Create: `backend/apps/media-worker/src/classification.test.ts`

**Interfaces:**
- Produces `MediaMetadataSchema`, `ClassificationLabelSchema`, `MetadataClassificationJobPayloadSchema`, and their inferred types in `@streamflow/contracts`.
- Produces `parseProbeOutput(data: unknown): ProbeResult` and `probeMedia(filePath: string): Promise<ProbeResult>`.
- Produces `classifyMedia(probe: ProbeResult, mediaType: MediaType): { metadata: MediaMetadata; labels: string[] }`.
- `ProbeResult` includes explicit stream presence, optional dimensions/codecs/bitrate/container/audio properties, and normalized format/stream tags.

- [ ] **Step 1: Write failing contract and classifier tests**

  Add tests that assert the metadata schema strips unknown probe fields, accepts bounded optional values, parses metadata job payloads, and defaults missing media classification labels to `[]`. Add classifier tests for 2160/720/SD boundaries, FLAC/ALAC/PCM versus AAC/MP3/Opus, genre normalization and deduplication, deterministic ordering, and missing optional fields.

- [ ] **Step 2: Run the focused tests and verify they fail for missing interfaces**

  Run: `pnpm --filter @streamflow/contracts test -- classification.test.ts && pnpm --filter @streamflow/media-worker test -- classification.test.ts probe.util.test.ts`

  Expected: FAIL because the new schemas, parser, and classifier do not exist yet.

- [ ] **Step 3: Implement the shared schemas and probe parser**

  Add the versioned `MediaMetadataSchema`, slug-safe label schema, and metadata job payload schema. Extend `ProbeResult` and ffprobe arguments to request format name/tags/size plus stream tags, sample rate, and channels. Implement a defensive `parseProbeOutput` that omits invalid optional values, preserves only known tag keys/values, and records whether audio/video streams exist.

- [ ] **Step 4: Implement `classifyMedia` with the specified rules**

  Normalize genre values with bounded slug conversion and sorted deduplication. Apply the largest-dimension video thresholds and codec lossless set exactly from the design. Return a normalized metadata object and labels without throwing for absent optional fields.

- [ ] **Step 5: Run focused tests and verify they pass**

  Run: `pnpm --filter @streamflow/contracts test -- classification.test.ts && pnpm --filter @streamflow/media-worker test -- classification.test.ts probe.util.test.ts`

  Expected: PASS with no unhandled warnings.

- [ ] **Step 6: Commit the shared/domain layer**

  ```bash
  git add shared/contracts/src/classification.ts shared/contracts/src/index.ts shared/contracts/src/media.ts shared/contracts/src/classification.test.ts backend/apps/media-worker/src/probe.util.ts backend/apps/media-worker/src/probe.util.test.ts backend/apps/media-worker/src/classification.ts backend/apps/media-worker/src/classification.test.ts
  git commit -m "feat: add metadata classification rules"
  ```

### Task 2: Persist metadata and labels in PostgreSQL

**Files:**
- Modify: `backend/packages/database/src/schema.ts`
- Create: `backend/packages/database/drizzle/0006_automatic_media_classification.sql`
- Modify: `backend/packages/database/src/transcode-repository.ts`
- Create: `backend/packages/database/src/metadata-repository.ts`
- Modify: `backend/packages/database/src/index.ts`
- Create: `backend/packages/database/test/metadata-repository.test.ts`
- Modify: `backend/apps/media-worker/test/transcode-pipeline.test.ts`

**Interfaces:**
- Adds `mediaTable.metadata` JSONB and `mediaTable.classificationLabels` text array with a GIN index and safe defaults.
- Produces `updateMediaClassification(db, mediaId, metadata, labels): Promise<void>` for non-transcode metadata jobs.
- Changes `publishTranscodedMediaAtomic(sqlClient, mediaId, jobId, assets, classification)` so the media update includes metadata and labels in the same transaction as publication.

- [ ] **Step 1: Write failing persistence tests**

  In `metadata-repository.test.ts`, insert a media row, call `updateMediaClassification`, and assert the normalized JSON and labels round-trip, empty labels are allowed, and a second identical call is stable. Extend the transcode integration assertion to require metadata and labels after successful publication and no classification update after a failed probe.

- [ ] **Step 2: Run the focused database/worker tests and verify the expected schema failure**

  Run: `pnpm --filter @streamflow/database test -- metadata-repository.test.ts && pnpm --filter @streamflow/media-worker test -- transcode-pipeline.test.ts`

  Expected: FAIL because the migration, columns, and repository signatures are not present.

- [ ] **Step 3: Add the additive migration and Drizzle schema fields**

  Create migration `0006_automatic_media_classification.sql` with nullable JSONB metadata, non-null text-array labels defaulting to an empty array, and a GIN index for exact label containment. Reflect the same fields and inferred types in `schema.ts`; do not alter existing rows beyond the safe defaults.

- [ ] **Step 4: Implement classification persistence and atomic publication inputs**

  Add `updateMediaClassification` using a single media update. Extend `publishTranscodedMediaAtomic` to update `metadata` and `classification_labels` inside its existing transaction before setting `READY`; keep its asset/job idempotency behavior unchanged.

- [ ] **Step 5: Run focused tests and verify persistence passes**

  Run: `pnpm --filter @streamflow/database test -- metadata-repository.test.ts && pnpm --filter @streamflow/media-worker test -- transcode-pipeline.test.ts`

  Expected: PASS, including atomic publication and failed-probe behavior.

- [ ] **Step 6: Commit the persistence layer**

  ```bash
  git add backend/packages/database/src/schema.ts backend/packages/database/drizzle/0006_automatic_media_classification.sql backend/packages/database/src/transcode-repository.ts backend/packages/database/src/metadata-repository.ts backend/packages/database/src/index.ts backend/packages/database/test/metadata-repository.test.ts backend/apps/media-worker/test/transcode-pipeline.test.ts
  git commit -m "feat: persist media classification metadata"
  ```

### Task 3: Queue and run metadata classification jobs

**Files:**
- Modify: `shared/contracts/src/classification.ts`
- Modify: `backend/apps/api/src/queue/queue.service.ts`
- Modify: `backend/apps/api/src/upload/upload.service.ts`
- Modify: `backend/apps/api/src/upload/upload.module.ts`
- Modify: `backend/apps/media-worker/src/worker.ts`
- Modify: `backend/apps/media-worker/src/index.ts`
- Create: `backend/apps/media-worker/src/metadata-job.ts`
- Create: `backend/apps/media-worker/test/metadata-job.test.ts`
- Modify: `backend/apps/media-worker/test/worker-queue.test.ts`
- Modify: `backend/apps/api/test/upload.integration.test.ts`

**Interfaces:**
- Produces `getMetadataJobId(mediaId: string, sourceAssetId: string): string` and `MetadataClassificationJobPayload`.
- `QueueService.enqueueMetadataClassification(mediaId: string, sourceAssetId?: string)` finds the source asset, enqueues a deterministic metadata job, and returns its job id/status.
- `runMetadataClassificationJob(options): Promise<{ labels: string[] }>` downloads the object, probes it, classifies it using the media row type, and persists the result.
- The worker accepts legacy transcode payloads plus the new discriminated metadata payload; legacy payloads continue to run the transcode path.

- [ ] **Step 1: Write failing queue and worker tests**

  Test that upload completion enqueues one metadata job for the newly created source asset, repeated completion returns `ALREADY_COMPLETED` without another enqueue, a metadata job downloads/probes/classifies/persists, and the deterministic job id makes repeated enqueue safe. Test a failed probe retries through the existing BullMQ policy and leaves media status unchanged.

- [ ] **Step 2: Run focused tests and verify they fail**

  Run: `pnpm --filter @streamflow/media-worker test -- metadata-job.test.ts worker-queue.test.ts && pnpm --filter @streamflow/api test -- upload.integration.test.ts`

  Expected: FAIL because the metadata payload, queue method, and worker branch do not exist.

- [ ] **Step 3: Implement the metadata job contract and queue method**

  Add the discriminated payload and deterministic id helper. Reuse the existing Redis connection and queue name; enqueue metadata jobs with the same configured retry/backoff settings, a distinct BullMQ job name, and a stable `jobId`.

- [ ] **Step 4: Enqueue after successful upload asset creation**

  Inject the global `QueueService` into `UploadService`. After `completeUploadSessionAndCreateAsset` returns a newly claimed asset, enqueue metadata classification using its media/source asset/object key. Preserve the existing idempotent early return for already completed sessions.

- [ ] **Step 5: Implement worker metadata execution**

  Add the storage download/probe/classify/persist flow in `metadata-job.ts`. Extend `createTranscodeWorker` to branch on metadata jobs while preserving the current transcode branch, shutdown behavior, retry semantics, and bounded structured logging. Metadata writes must not change media publication status.

- [ ] **Step 6: Run focused tests and verify they pass**

  Run: `pnpm --filter @streamflow/media-worker test -- metadata-job.test.ts worker-queue.test.ts && pnpm --filter @streamflow/api test -- upload.integration.test.ts`

  Expected: PASS with idempotent enqueue and retry behavior covered.

- [ ] **Step 7: Commit the worker job layer**

  ```bash
  git add shared/contracts/src/classification.ts backend/apps/api/src/queue/queue.service.ts backend/apps/api/src/upload/upload.service.ts backend/apps/api/src/upload/upload.module.ts backend/apps/media-worker/src/worker.ts backend/apps/media-worker/src/index.ts backend/apps/media-worker/src/metadata-job.ts backend/apps/media-worker/test/metadata-job.test.ts backend/apps/media-worker/test/worker-queue.test.ts backend/apps/api/test/upload.integration.test.ts
  git commit -m "feat: classify uploaded media in worker"
  ```

### Task 4: Integrate classification with video publication

**Files:**
- Modify: `backend/apps/media-worker/src/transcode-pipeline.ts`
- Modify: `backend/apps/media-worker/test/transcode-pipeline.test.ts`
- Modify: `backend/apps/media-worker/test/atomic-publish.test.ts`

**Interfaces:**
- `executeTranscodePipeline` loads `mediaTable.type` for `job.mediaId`, calls `classifyMedia(probe, media.type)` once after probing, and passes `{ metadata, labels }` to `publishTranscodedMediaAtomic`.

- [ ] **Step 1: Add the failing end-to-end classification assertions**

  Extend the valid synthetic video fixture to assert `video-hd` and persisted normalized metadata. Add a fixture with a 2160-pixel dimension or a pure classifier-backed pipeline test for `video-4k`. Keep the interrupted-publication test asserting that no metadata/labels are visible when atomic publication does not run.

- [ ] **Step 2: Run the focused pipeline tests and verify the new assertions fail**

  Run: `pnpm --filter @streamflow/media-worker test -- transcode-pipeline.test.ts atomic-publish.test.ts`

  Expected: FAIL because the pipeline does not yet pass classification into publication.

- [ ] **Step 3: Integrate the shared classifier into the pipeline**

  Classify immediately after the existing probe validation, retain the current invalid-media failure path, and pass the result into the repository transaction. Do not duplicate rule logic in the pipeline.

- [ ] **Step 4: Run focused tests and verify publication remains atomic**

  Run: `pnpm --filter @streamflow/media-worker test -- transcode-pipeline.test.ts atomic-publish.test.ts`

  Expected: PASS; successful media is `READY` with labels, and interrupted/corrupt media remains `DRAFT` without partial metadata publication.

- [ ] **Step 5: Commit the video integration**

  ```bash
  git add backend/apps/media-worker/src/transcode-pipeline.ts backend/apps/media-worker/test/transcode-pipeline.test.ts backend/apps/media-worker/test/atomic-publish.test.ts
  git commit -m "feat: classify video before publication"
  ```

### Task 5: Expose classification through catalog, search, and detail APIs

**Files:**
- Modify: `shared/contracts/src/catalog.ts`
- Modify: `backend/packages/database/src/catalog-repository.ts`
- Modify: `backend/packages/database/src/media-repository.ts`
- Modify: `backend/packages/database/src/library-repository.ts`
- Modify: `backend/packages/database/src/playlist-repository.ts`
- Modify: `backend/apps/api/src/media/media.service.ts`
- Modify: `backend/apps/api/test/catalog.integration.test.ts`
- Modify: `backend/packages/database/test/catalog-pagination.test.ts`
- Modify: `shared/contracts/src/catalog.test.ts`

**Interfaces:**
- `CursorPaginationQuerySchema` and `SearchQuerySchema` accept optional `classification` with the normalized label constraints.
- `listMediaKeyset` and `searchMedia` apply exact `classification_labels @> ARRAY[...]` filtering without changing cursor ordering.
- `MediaItem` and `MediaDetail` responses include `classificationLabels`; raw metadata stays out of public responses.

- [ ] **Step 1: Write failing contract, repository, and HTTP tests**

  Add schema tests for valid labels, invalid labels, and repeated query arrays. Seed media with overlapping labels and assert catalog/detail/search responses include labels, exact filtering works, draft media remains hidden, and cursor pages contain no duplicates or skips while filtered.

- [ ] **Step 2: Run focused tests and verify they fail**

  Run: `pnpm --filter @streamflow/contracts test -- catalog.test.ts && pnpm --filter @streamflow/database test -- catalog-pagination.test.ts && pnpm --filter @streamflow/api test -- catalog.integration.test.ts`

  Expected: FAIL because contracts, projections, and SQL filters do not yet include classification.

- [ ] **Step 3: Extend contracts and all media projections**

  Add `classificationLabels` with a parser default of `[]` for backward-compatible clients. Select the column in catalog, search, detail, library, and playlist repository projections; do not expose the JSON metadata object publicly.

- [ ] **Step 4: Add exact-label SQL filtering and cache-key versioning**

  Add the optional filter to both keyset query builders, preserve the current `(coalesce(published_at, created_at), id)` ordering, and include the classification value in the catalog cache key with a new version. Search remains uncached as today.

- [ ] **Step 5: Run focused tests and verify they pass**

  Run: `pnpm --filter @streamflow/contracts test -- catalog.test.ts && pnpm --filter @streamflow/database test -- catalog-pagination.test.ts && pnpm --filter @streamflow/api test -- catalog.integration.test.ts`

  Expected: PASS, including filtered pagination and backward-compatible parsing.

- [ ] **Step 6: Commit the API/query layer**

  ```bash
  git add shared/contracts/src/catalog.ts shared/contracts/src/catalog.test.ts backend/packages/database/src/catalog-repository.ts backend/packages/database/src/media-repository.ts backend/packages/database/src/library-repository.ts backend/packages/database/src/playlist-repository.ts backend/packages/database/test/catalog-pagination.test.ts backend/apps/api/src/media/media.service.ts backend/apps/api/test/catalog.integration.test.ts
  git commit -m "feat: expose media classification filters"
  ```

### Task 6: Render labels and preserve classification filters in the web app

**Files:**
- Modify: `frontend/apps/web/src/lib/media-api.ts`
- Modify: `frontend/apps/web/src/lib/search-state.ts`
- Modify: `frontend/apps/web/src/app/search/page.tsx`
- Modify: `frontend/apps/web/src/components/search-surface.tsx`
- Modify: `frontend/apps/web/src/components/media-card.tsx`
- Modify: `frontend/apps/web/src/components/media-details.tsx`
- Modify: `frontend/apps/web/src/lib/media-api.test.ts`
- Modify: `frontend/apps/web/src/lib/search-state.test.ts`
- Modify: `frontend/apps/web/src/components/media-primitives.test.ts`

**Interfaces:**
- `FetchMediaOptions` and `searchMedia` accept `classification?: string` and forward it on every page request.
- `readSearchState` returns `{ query, type, classification? }`; `searchHref(query, type, classification?)` preserves all three values.
- `MediaCard` and `MediaDetails` render the first three `classificationLabels` with an accessible overflow indicator.

- [ ] **Step 1: Write failing web tests**

  Assert API URLs include classification on initial and cursor requests, URL state round-trips a valid label and drops invalid values, and media primitives render labels/overflow text without crashing when labels are absent.

- [ ] **Step 2: Run focused tests and verify they fail**

  Run: `pnpm --filter @streamflow/web test -- media-api.test.ts search-state.test.ts media-primitives.test.ts`

  Expected: FAIL because the web data boundary and components do not accept classification.

- [ ] **Step 3: Implement API/query state plumbing**

  Add classification to fetch/search options, URL serialization, server page props, and infinite-load callbacks. Keep query/type behavior unchanged and use the shared slug-safe label constraint.

- [ ] **Step 4: Add filter control and label presentation**

  Add a compact classification input/select based on the current query state and render labels in cards/details with text and accessible names. Preserve existing empty, loading, and error states.

- [ ] **Step 5: Run focused tests and verify they pass**

  Run: `pnpm --filter @streamflow/web test -- media-api.test.ts search-state.test.ts media-primitives.test.ts`

  Expected: PASS with cursor requests retaining classification.

- [ ] **Step 6: Commit the web integration**

  ```bash
  git add frontend/apps/web/src/lib/media-api.ts frontend/apps/web/src/lib/search-state.ts frontend/apps/web/src/app/search/page.tsx frontend/apps/web/src/components/search-surface.tsx frontend/apps/web/src/components/media-card.tsx frontend/apps/web/src/components/media-details.tsx frontend/apps/web/src/lib/media-api.test.ts frontend/apps/web/src/lib/search-state.test.ts frontend/apps/web/src/components/media-primitives.test.ts
  git commit -m "feat: show media classification in web catalog"
  ```

### Task 7: Full verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-06-automatic-media-classification-design.md`
- Create: `docs/ui/automatic-classification.md`

- [ ] **Step 1: Run the repository checks**

  Run: `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm check`.

  Expected: all commands pass. If PostgreSQL/Testcontainers cannot start in this environment, record the exact skipped/blocked integration command and still run every unit, type, build, and lint check that does not require the unavailable service.

- [ ] **Step 2: Verify migration and representative behavior**

  Run the database migration against the project test database, inspect the GIN index and default labels, and exercise one video and one audio metadata job with fixtures. Confirm catalog filtering and UI pagination retain the classification query.

- [ ] **Step 3: Document operational behavior**

  Add `docs/ui/automatic-classification.md` describing the labels, metadata normalization, retry/idempotency behavior, and the fact that semantic genres require embedded file tags. Update the design status to implemented only after all checks pass.

- [ ] **Step 4: Review the final diff and commit documentation**

  Run: `git diff --check` and `git status --short`.

  ```bash
  git add docs/superpowers/specs/2026-11-06-automatic-media-classification-design.md docs/ui/automatic-classification.md
  git commit -m "docs: document automatic classification behavior"
  ```

## Self-review

- **Spec coverage:** Probe fields/rules are covered by Task 1; persistence and atomic publication by Task 2/4; audio and retry execution by Task 3; API filtering and response shape by Task 5; UI state and badges by Task 6; operational documentation and full verification by Task 7.
- **Type consistency:** `MediaMetadata`, `ClassificationResult`, and `MetadataClassificationJobPayload` are introduced before database, worker, API, and web tasks consume them. The changed publication signature is introduced in Task 2 and consumed in Task 4.
- **Review focus coverage:** Each failure mode listed above has a named test in its owning task.
- **Proportion:** The plan leaves implementation bodies to the builder while fixing file paths, interfaces, values, test commands, and transaction boundaries.

