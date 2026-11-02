# User uploads with administrator moderation

Date: 2026-11-02
Status: Approved by the user on 2026-11-02; implementation planning follows.

## Intent and agreed direction

StreamFlow is to become a platform where authenticated users upload music and video, manage their own submissions, and listen to/watch content published by other users. Users interact with media titles and upload progress; they do not manage UUIDs, storage paths, FFmpeg, or R2 manually.

The user explicitly requires administrator approval before uploaded content becomes public. The selected approach is to process uploaded media first, then let administrators review a playable preview. Processing success alone must never publish a submission.

All other MVP choices below are proposed implementation decisions, not additional requirements already approved by the user.

## Approaches considered

1. **Process first, review second — selected.** Administrators can review normalized, playable audio/video. This uses processing resources even for rejected submissions, but makes review consistent across supported source formats.
2. **Review the source first, process after approval.** Avoids transcoding rejected submissions, but preview compatibility depends on the original codec and publication still waits for processing after approval.

Keep the existing NestJS/Fastify API, PostgreSQL/Drizzle, BullMQ/Redis, FFmpeg worker, Next.js frontend, shared Zod contracts, and S3-compatible R2 storage. No new external media processing service or microservice split is proposed.

## Current implementation and gaps

- Upload API (`v1/admin/uploads`) and `AdminUpload` UI are ADMIN-only.
- Upload sessions have `userId`, but media has no owner. Session reads/completion currently have no per-owner authorization because only admins can access them.
- Upload completion registers an asset but does not automatically enqueue processing. Its database updates are not currently one transaction.
- The worker passes an object key to FFmpeg as a local path, writes output to a shared local directory, and does not upload output to R2.
- `publishTranscodedMediaAtomic` currently marks media READY and sets `published_at` as soon as processing completes. It must be replaced with processing completion that leaves the media unpublished.
- The video ladder and playback contracts assume video; audio needs a separate processing and player path.
- Public playback currently fabricates a playlist URL when no real HLS asset exists. This must become an explicit not-playable response.
- Catalog/search/detail/library/playlist projections currently rely on READY without a moderation boundary.
- The configured public R2 bucket is `stream-flow`. Ten seeded catalog rows are metadata-only; one has manually uploaded test HLS. These are not evidence of a complete upload pipeline.
- User changes already present in `backend/apps/api/src/app.module.ts` configure CORS and must be preserved.

## MVP user experience

### Creator

- Any authenticated USER or ADMIN can create a submission with media type, title, description, and one supported source file.
- Upload directly to private object storage using a short-lived presigned PUT URL. Show upload progress and make complete-upload retryable without creating duplicate media/jobs.
- After upload, automatically validate/process and submit successful output for review. No separate submit button is necessary for the first upload.
- A **My uploads** page shows waiting for upload, processing, processing failed, pending review, approved/publishing, published, publication failed, or rejected with a reason.
- Owners can preview successfully processed submissions even while pending/rejected. They can edit metadata in DRAFT/REJECTED only when processing is AWAITING_UPLOAD, FAILED, or READY and there is no active processing/publication task. They can explicitly resubmit rejected submissions. Editing is temporarily locked during QUEUED/PROCESSING so an edit cannot invalidate an in-flight job; after failure the owner can edit and explicitly retry against the new version. Pending review, publishing, and published submissions are immutable in this MVP.
- Replacing a source file creates a new submission/media ID and requires a fresh review. Versioned editing of already published media is deferred; there is no path to replace reviewed bytes without review.
- Owners can delete their submissions; admins can remove any submission. Deletion hides it immediately at application endpoints and schedules object cleanup.

### Administrator

- A review queue lists successfully processed submissions with creator, type, title, description, duration, and submitted timestamp.
- The review page plays the exact private processed output being reviewed.
- **Approve** records a decision and starts publication; **Reject** requires a reason visible to the owner. Processing failures cannot be approved.
- Decisions use an expected version. A stale page, a second concurrent decision, or an owner withdrawing the item returns a conflict rather than silently overriding another action.
- ADMIN may review any submission in the MVP, including their own; a separate second-reviewer policy is not required. Bootstrap uses an existing database operator to promote an account; there is no public role-change endpoint or hardcoded admin password.
- Audit history records reviewer, decision, reason, timestamp, and reviewed media version.

### Audience

- Public discovery and playback include only successfully published, administrator-approved media.
- Video plays HLS with available quality levels. Audio uses an audio player and an audio-only HLS stream.
- Unpublished/deleted items in old favorites/playlists/history must not reveal private metadata or return playable URLs. Filter them from audience projections; retain relational records where appropriate.

## States and invariants

Use separate persisted fields:

- `processingStatus`: AWAITING_UPLOAD, QUEUED, PROCESSING, READY, FAILED.
- `moderationStatus`: DRAFT, PENDING_REVIEW, APPROVED, REJECTED.
- `publicationStatus`: UNPUBLISHED, PUBLISHING, PUBLISHED, FAILED, REMOVING, REMOVED.

Retain existing `media.status` temporarily for compatibility: DRAFT until publication succeeds; READY only for a published item. It is derived by server transitions and cannot be directly patched by users or by legacy admin CRUD.

Core transitions:

1. Init: AWAITING_UPLOAD / DRAFT / UNPUBLISHED.
2. Verified completion: QUEUED / DRAFT / UNPUBLISHED; persist a processing task in the same DB transaction.
3. Successful processing and private output verification: READY / PENDING_REVIEW / UNPUBLISHED.
4. Failed processing: FAILED / DRAFT / UNPUBLISHED with an owner-visible error.
5. Reject: READY / REJECTED / UNPUBLISHED with a required reason.
6. Metadata edit in DRAFT/REJECTED, with no active task and processing AWAITING_UPLOAD/FAILED/READY, increments `version`; an edit during QUEUED/PROCESSING returns 409. Completing the first upload binds its new processing task to the current version. Retrying a failed processing task is an explicit owner action bound to the latest version. Resubmit of a READY rejected item clears the active rejection and sets PENDING_REVIEW. Retain historical review decisions; metadata-only resubmission keeps the verified processing run and binds the review to the new metadata version.
7. Approve: READY / APPROVED / PUBLISHING plus a durable publication task in one transaction.
8. Successful publication: READY / APPROVED / PUBLISHED, legacy READY, and `published_at` set on first publication.
9. Publication failure: READY / APPROVED / FAILED. Admin can retry publication without repeating the decision; this is not a transcoding retry.
10. Delete: tombstone immediately, legacy DRAFT, REMOVING; cleanup eventually sets REMOVED.

Public eligibility is `deleted_at IS NULL AND processingStatus = READY AND moderationStatus = APPROVED AND publicationStatus = PUBLISHED`. Apply it to catalog, search, detail, playback start/manifest/thumbnail, and public-facing library/playlist/history/analytics projections. Private owner/admin APIs use separate authorization checks.

Only reviewed output may be published. Jobs and decisions bind to media version, source asset ID, and processing profile. A stale worker cannot overwrite a newer state or resurrect a deleted submission. A review decision cannot be bypassed by admin status patching, retranscode, seed, retry, cache, or a fallback asset URL.

## Storage, previews, and publication

### Two buckets

Proposed storage layout:

- Existing `stream-flow`: approved public derivatives only, served through the existing media domain.
- New `stream-flow-private`: originals and processed output awaiting review; no public custom domain or public development URL.

Keep `STORAGE_BUCKET_NAME=stream-flow` and `STORAGE_PUBLIC_URL` for published playback. Add required `STORAGE_PRIVATE_BUCKET_NAME=stream-flow-private` for user uploads. Credentials must cover both buckets. Local MinIO creates equivalent private/public buckets; only the published bucket gets anonymous read access. Never put originals in the public bucket.

Create the private bucket and configure permissions as a deployment prerequisite, not as a runtime operation requiring the application to have bucket-administration permission. This design turn does not change cloud resources or credentials.

Store explicit bucket/scope with asset records; do not infer private/public from an arbitrary user-supplied key. Use immutable prefixes incorporating media ID and processing run ID, e.g. `processed/<mediaId>/<runId>/...`. Each processing job has a separate temporary directory.

### Private previews

Authenticated owner/admin APIs issue a short-lived preview capability scoped to the reviewed media version and its recorded derivative files. Its master URL is served through the API, not the public media domain. Relative rendition/segment URLs remain within that capability path so the full HLS graph works in hls.js and native HLS.

For every preview object request, validate capability signature/expiry, current ownership or admin role, media version, deletion state, and an allowlist of files from the processing run. Stream the private S3 object with backpressure; never buffer an entire source in API memory. Reject traversal and arbitrary object-key access. Support needed GET/HEAD/range requests and correct content types. Redact capability tokens from request logs; a capability is a bearer credential, not a permanent share link.

Default capability lifetime is 15 minutes. The client refreshes it through the authenticated API before expiry and resumes the same playback position if a reload is needed. Issuance is owner/admin-only; the short-lived URL itself can be used by its holder until expiry/revocation. Sharing private submissions is not a product feature.

### Publication

Approval records APPROVED before any copying to the public bucket. A publication worker copies the verified derivatives to a deterministic version-specific public prefix: segments first, variant playlists next, master playlist last. Copy/PUT uses recorded MIME types and verifies output size/existence. Originals stay private.

Only after all public objects verify does a version-checked DB transaction record public assets, set PUBLISHED/legacy READY/`published_at`, and schedule cache invalidation. There is no claim of an ACID transaction across PostgreSQL and R2. Retry is idempotent. Incomplete copies are not discoverable through the application and are cleaned or completed on retry.

Deletion/removal tombstones the media before cleanup. An in-flight publisher must observe the tombstone and stop/finally clean its own output. Cleanup waits for active publication leases to finish/expire and runs a reconciliation pass to catch late objects. Clear application caches and request CDN purge for removed public keys. Previously downloaded bytes cannot be revoked; object deletion and CDN purge are not instantaneous.

## Upload and processing reliability

- Init/complete/session endpoints require authentication and owner-or-admin checks on every session operation. Unauthorized access to another user's submission returns 404. Administrative cleanup remains ADMIN-only.
- Server allocates the key. On complete, verify session owner, expiry, state, actual object size against declared size and configured limits, and declared media type. Repeated successful complete returns the same asset/task.
- Commit upload completion, source asset, media transition, and durable task atomically. A Redis outage must not lose an upload or processing request.
- Add a PostgreSQL `media_tasks` table for TRANSCODE, PUBLISH, DELETE, and cache/cleanup follow-up work. Keep it separate from playback `outbox_events`, whose existing relay publishes events to Kafka.
- The media worker includes a dispatcher/reconciler: claim tasks with bounded leases and SKIP LOCKED, enqueue stable BullMQ job IDs, and retry uncompleted tasks after crashes. Mark DONE only after the corresponding persisted result exists. Failed business work becomes explicit FAILED with bounded retries and manual retry where appropriate; it must not loop forever.
- Queue delivery and object writes are at-least-once. DB unique constraints, deterministic keys, version checks, and job completion checks make repeated execution safe. Do not hold a DB transaction/row lock while downloading, transcoding, or copying objects.
- Stream the private source to local disk using If-Match with the ETag captured at verified completion, and verify the actual byte count. A still-valid upload URL must not let changed source bytes silently replace the queued source snapshot: a mismatch fails explicitly and requires a new upload. Source keys are never reused across submissions. Processed output keys are never presigned for client writes. FFprobe checks actual container/streams, duration, and the AUDIO/VIDEO declaration before encoding; browser filename/MIME is not sufficient validation.
- Video: H.264/AAC HLS with existing 360p/720p/1080p ladder constrained by actual source dimensions; do not upscale a source below the baseline. Allow valid video-only sources. Generate a poster.
- Audio: audio-only AAC HLS at 128 kbps, no video dimensions/thumbnail requirement. Use a placeholder cover in the MVP; custom image upload is deferred.
- Verify all playlists, referenced segments, and video poster exist and are nonempty before private processing completion. Register segment assets as well as playlists.
- Separate paths per processing attempt. Clean local disk in `finally`; retain enough private source/output for retry/review. Remove expired upload objects and stale failed staging prefixes through bounded cleanup tasks.
- Worker has a writable scratch directory, installed FFmpeg/FFprobe, bounded concurrency, execution timeout, disk/size limits, and graceful shutdown. Transcoding is never performed in the API request handler.

## Proposed MVP limits

These are configurable starting values, not user-approved product policy:

- Video source: 1 GiB maximum; audio source: 100 MiB maximum.
- At most 3 unfinished uploads per user and 2 GiB total source bytes per user per day, enforced with transactional reservations and expiration/reconciliation.
- Duration limits: 2 hours for video and 30 minutes for audio, verified by FFprobe.
- Retain current source MIME allowlist initially. Clearly reject unsupported codecs/files and report the failure in My uploads.
- Network failures can retry upload completion or start a replacement upload. Multipart/resumable transfer, pause/resume across browser restarts, and platform-wide billing are deferred.

## Data model and APIs

### Data changes

- `media`: nullable legacy `owner_id`, description, three state fields, `version`, `submitted_at`, `deleted_at`; preserve existing metadata and timestamps.
- `media_reviews`: media ID, reviewed version/run, reviewer ID, decision, reason, timestamp; immutable decision history.
- `media_assets`: storage scope/bucket, processing run reference, recorded file kind/MIME/size; include segments and originals.
- Processing jobs/tasks record source asset, version/run, error/retry metadata, and lease/reconciliation information.
- Store quota reservations/counters transactionally; include indexes for owner lists, pending review, public publication ordering, and durable task scheduling.

### Endpoint families

- User upload init/complete/session under `/v1/uploads`; cleanup under an ADMIN-only route. Keep `/v1/admin/uploads` aliases temporarily if useful, with identical underlying ownership/expiry rules.
- `/v1/me/media`: list/detail/edit permitted metadata, resubmit, processing retry, delete, and request private preview.
- `/v1/admin/reviews`: queue/detail, approve/reject with expectedVersion and reason, publication retry.
- Preview capability routes serve only recorded processed derivatives.
- Existing public catalog/playback endpoints remain; manifest responses are discriminated AUDIO/VIDEO contracts. No fabricated HLS URL if assets are missing.
- Existing admin media CRUD must obey the new transitions. Remove direct status=READY publication and metadata/file mutation of reviewed submissions.

Builders may choose precise route suffixes, SQL enum versus constrained text for new states, and module/class boundaries. Preserve the behavior and authorization rules above; update shared contracts and all callers together.

## Frontend

- Replace AdminUpload with an authenticated creator upload flow and accurate progress/error states.
- Add My uploads, submission detail/preview/rejection reason, and an ADMIN-only review queue/detail page.
- Use one API URL configuration for browser calls and a server-only API base where needed; retain credentialed auth and correct CORS methods/headers. Keep implementation details out of product copy.
- Poll persisted processing/publication state initially (about every 3 seconds while active, back off/stop when terminal); no WebSocket dependency is needed.
- Provide separate audio/video playback presentation using shared HLS transport and preview authorization handling.
- Public cards show play only when a real approved published asset is available. Empty-state copy must no longer tell end users to run a seed command.

## Migration and rollout

- Add migrations; do not modify migrations already applied on the user's database. Do not reset the database.
- Preserve users/playlists/favorites/history. Backfill media owner from a single unambiguous upload owner; leave metadata-only legacy rows ownerless and admin-managed.
- Existing READY/seed rows are not automatically approved. Move them to unpublished legacy DRAFT unless an administrator explicitly reviews verified real assets. Hide metadata-only samples from public discovery and disable default seeding of fake playable READY items. An opt-in demo seed can exist separately.
- Inventory known manually uploaded demo/public objects before rollout. Copy recoverable existing output to private storage and verify it before removing public copies/purging their cache. Do not silently delete the user's existing R2 data. Unknown legacy objects require an operator inventory decision; full moderation/privacy readiness must not be claimed while unreviewed objects remain publicly reachable.
- Correct API/worker start paths (`dist/main.js`, `dist/index.js`) and Docker root tsconfig copying/worker builds/FFmpeg availability. Add a documented local command to run the worker/dispatcher alongside API/web.
- Update `.env.example` and setup/runbooks without printing or committing `.env` or credentials. Provide private/public bucket setup and CORS instructions with correct bucket names.
- Public/private bucket provisioning and any legacy object migration are separate rollout actions; no production deployment/cloud mutation is part of approving this design alone.

## Validation and acceptance

1. A normal USER uploads both an actual MP4 and an actual supported audio file through the browser; upload complete is idempotent.
2. Worker downloads/processes/uploads without manual S3 paths or FFmpeg commands. Before review, neither catalog/search/detail nor public storage exposes new submission content.
3. Owner and ADMIN can preview the complete HLS graph; another USER cannot obtain a preview. Invalid/stale/expired capabilities and path traversal fail.
4. Processing success ends in PENDING_REVIEW, never automatic publication. Corrupt/oversized/mismatched media fails clearly.
5. Approve publishes verified outputs; video and audio play through the public media domain. Published items have real assets and non-null `published_at`; keyset pagination has a usable nextCursor when hasMore is true.
6. Reject requires a reason; owner sees it and can edit/resubmit. No rejected media is public. Non-admin review attempts fail. Edits during processing return 409, while edits after processing failure and an explicit retry target the new version without leaving the submission stuck.
7. Stale/concurrent decisions, duplicate complete, Redis outage, worker crash after object upload, and publication retries do not lose tasks, duplicate outputs/reviews, or bypass moderation.
8. Delete during processing/publication cannot resurrect content. Old library/playlist/history references cannot expose unpublished metadata or playback; storage cleanup is retryable.
9. Legacy admin CRUD/seed/tests cannot bypass the new visibility invariant. Migration preserves existing user/library data.
10. Lint, fresh build/typecheck, meaningful database/authorization/worker integration tests, and browser smoke tests pass. R2 smoke verification uses a dedicated test prefix with explicitly authorized upload/cleanup and does not touch unrelated objects.

## Non-goals and remaining builder choices

Not in this MVP: recommendations, comments/follows, monetization/subscriptions, live streaming, DRM, automated copyright/moderation verdicts, custom cover upload, user-controlled private/unlisted sharing, multipart resumability, and in-place revisions of approved content.

The administrator makes the review decision; this design does not invent review policy or legal criteria. Builders may settle internal module boundaries, polling mechanics, test fixtures, exact task bookkeeping columns, and error copy. Defaults and the two-bucket/preview/editing/limit choices must be called out to the user before implementation.

## Builder review

A separate reviewer read this draft on 2026-11-02. The only blocking ambiguity was whether editing DRAFT metadata during an active processing job invalidates that job. Resolved as a proposed implementation decision: reject edits during QUEUED/PROCESSING, then allow metadata edits and an explicit version-bound retry after failure. Metadata-only resubmission after successful processing reuses its verified output and requires a new review of the changed metadata.
