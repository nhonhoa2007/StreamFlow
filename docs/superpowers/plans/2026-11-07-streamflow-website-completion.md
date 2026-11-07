# StreamFlow Website Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện các luồng website cốt lõi của StreamFlow cho người dùng và quản trị viên: playlist/lịch sử/hồ sơ, Admin Studio, player/search/accessibility, rồi kiểm thử và harden trước khi phát hành.

**Architecture:** Giữ Next.js hiện tại làm lớp trải nghiệm, dùng các API NestJS và Zod contracts đang có. Backend playlist, admin media, upload, transcode và playback được tái sử dụng; chỉ mở rộng nơi còn thiếu (cập nhật playlist, lịch sử, hồ sơ/mật khẩu nếu cần). Mỗi mốc tạo ra một luồng chạy được và có test riêng.

**Tech Stack:** TypeScript, Next.js 15, React 19, NestJS, PostgreSQL/Drizzle, Zod, HLS.js, Vitest, integration tests bằng PostgreSQL/Redis/MinIO theo test harness hiện có.

**Spec:** `StreamFlow_Advanced_Roadmap (3).md`, các route/contracts hiện có trong `frontend/apps/web/src`, `backend/apps/api/src`, `shared/contracts/src`, và phạm vi tính năng đã được người dùng chấp thuận trong cuộc hội thoại.

## Global Constraints

- Giữ TypeScript end-to-end và các schema Zod làm nguồn kiểm tra request/response.
- Giữ RBAC `USER`/`ADMIN`, signed URL và media private; mọi endpoint mới phải có integration test quyền truy cập.
- Không thêm recommendation ML, social/chat, live streaming, DRM, payment, native mobile, multi-region hoặc offline/PWA vào MVP.
- Không reset hoặc ghi đè các thay đổi sẵn có trong working tree; mỗi task chỉ chạm vào file cần thiết cho task đó.
- Không thêm dependency mới nếu API/browser hiện tại đã đáp ứng yêu cầu.
- Media dùng trong demo phải do nhóm sở hữu, được cấp phép hoặc thuộc public domain.

## Review Focus

- Playlist bị cập nhật đồng thời phải trả `409` và giữ dữ liệu của phiên thắng; test ở Task 1.
- Người dùng không được đọc hoặc sửa playlist, history hay profile của người khác; test ở Task 1.
- Media draft/failed không được xuất hiện trong catalog public sau thao tác admin; test ở Task 2.
- Retry transcode phải idempotent và UI phải phân biệt `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`; test ở Task 2.
- Query search/filter không được làm mất cursor hoặc tạo request sai khi giá trị rỗng; test ở Task 3.

### Task 1: Hoàn thiện thư viện người dùng

**Files:**
- Modify: `shared/contracts/src/playlist.ts`
- Modify: `shared/contracts/src/library.ts`
- Modify: `backend/packages/database/src/playlist-repository.ts`
- Modify: `backend/apps/api/src/playlist/playlist.controller.ts`
- Modify: `backend/apps/api/src/playlist/playlist.service.ts`
- Modify: `backend/apps/api/src/library/library.controller.ts`
- Modify: `backend/apps/api/src/library/library.service.ts`
- Modify: `backend/packages/database/src/playback-repository.ts`
- Modify: `frontend/apps/web/src/lib/media-api.ts`
- Modify: `frontend/apps/web/src/lib/library-context.tsx`
- Create: `frontend/apps/web/src/app/playlists/page.tsx`
- Create: `frontend/apps/web/src/app/playlists/[id]/page.tsx`
- Create: `frontend/apps/web/src/components/playlist-list.tsx`
- Create: `frontend/apps/web/src/components/playlist-detail.tsx`
- Create: `frontend/apps/web/src/components/playlist-dialog.tsx`
- Modify: `frontend/apps/web/src/components/media-details.tsx`
- Modify: `frontend/apps/web/src/components/library-surface.tsx`
- Create: `frontend/apps/web/src/app/profile/page.tsx`
- Create: `frontend/apps/web/src/components/profile-settings.tsx`
- Test: `backend/apps/api/test/playlist.integration.test.ts`
- Test: `backend/apps/api/test/library.integration.test.ts`
- Test: `frontend/apps/web/src/lib/media-api.test.ts`
- Create: `frontend/apps/web/src/components/playlist-detail.test.tsx`

**Interfaces:**
- Consumes: Existing `GET/POST /v1/playlists`, `GET /v1/playlists/:id`, `POST/DELETE /v1/playlists/:id/items`, `PATCH /v1/playlists/:id/items/reorder`, `GET /v1/library/continue`, and `GET /v1/auth/me`.
- Produces: `PATCH /v1/playlists/:id` and `DELETE /v1/playlists/:id`; `GET /v1/library/history` returning the existing `ContinueItem` shape ordered by `updatedAt`; typed client functions `fetchPlaylists`, `createPlaylist`, `updatePlaylist`, `deletePlaylist`, `fetchPlaylistDetail`, `addPlaylistItem`, `removePlaylistItem`, `reorderPlaylistItems`, and `fetchHistory`.

- [ ] **Step 1: Write failing contract and repository tests.**
  Add tests for playlist update/delete payload validation, ownership checks, history ordering, and empty history. Assert that an invalid owner receives a not-found response rather than another user's data.

- [ ] **Step 2: Run focused backend tests and verify failure.**
  Run `pnpm --filter @streamflow/api test -- playlist.integration.test.ts library.integration.test.ts`.
  Expected: the new tests fail because update/delete/history interfaces do not exist.

- [ ] **Step 3: Implement playlist update/delete and history repository methods.**
  Add `updatePlaylist` and `deletePlaylist` in `playlist-repository.ts`, preserving owner predicates and incrementing `updatedAt`. Add `listPlaybackHistory` in `playback-repository.ts`, joining published media and ordering by `playback_progress.updated_at DESC` with a bounded limit.

- [ ] **Step 4: Expose typed API endpoints.**
  Add `PATCH` and `DELETE` handlers to `playlist.controller.ts` using `UpdatePlaylistSchema`. Add `LibraryHistoryResponseSchema` to `shared/contracts/src/library.ts`, export it through `shared/contracts/src/index.ts`, and use it to validate `GET v1/library/history` in the library controller/service.

- [ ] **Step 5: Run backend tests and verify pass.**
  Run `pnpm --filter @streamflow/api test -- playlist.integration.test.ts library.integration.test.ts` and `pnpm --filter @streamflow/contracts test`.
  Expected: PASS, including ownership and history ordering cases.

- [ ] **Step 6: Add frontend API adapters and tests.**
  Implement the playlist and history functions in `media-api.ts` with `Authorization` headers, JSON parsing, schema validation, and stable user-facing errors. Add request method/path/body assertions to `media-api.test.ts`.

- [ ] **Step 7: Build playlist routes and interactions.**
  Add `/playlists` for the user's playlist summaries and `/playlists/[id]` for detail, add/remove, and drag-free move up/down reorder controls. Use `version` as `expectedVersion`; on `409`, refetch and show a recoverable conflict message. Add a playlist picker/create dialog from media details.

- [ ] **Step 8: Add history and profile surfaces.**
  Extend Library with a history section backed by `fetchHistory`. Add `/profile` with email, role, account creation date, and sign-out controls. Keep password reset via email out of this task until a mail provider is selected; expose a clear link/placeholder only if the product copy requires it.

- [ ] **Step 9: Run frontend verification.**
  Run `pnpm --filter @streamflow/web test`, `pnpm --filter @streamflow/web typecheck`, and `pnpm --filter @streamflow/web build`.
  Expected: PASS; playlist creation, empty states, conflict recovery, history and profile render without authentication leaks.

- [ ] **Step 10: Commit the independently shippable milestone.**
  Commit with `feat: complete user library and playlists`.

### Task 2: Hoàn thiện Admin Studio

**Files:**
- Modify: `frontend/apps/web/src/lib/media-api.ts`
- Create: `frontend/apps/web/src/lib/admin-api.ts`
- Create: `shared/contracts/src/admin.ts`
- Modify: `shared/contracts/src/index.ts`
- Modify: `frontend/apps/web/src/components/admin-workspace.tsx`
- Create: `frontend/apps/web/src/components/admin-media-table.tsx`
- Create: `frontend/apps/web/src/components/admin-media-editor.tsx`
- Create: `frontend/apps/web/src/components/admin-job-status.tsx`
- Modify: `frontend/apps/web/src/components/admin-upload.tsx`
- Modify: `frontend/apps/web/src/components/admin-access.ts`
- Modify: `frontend/apps/web/src/app/admin/page.tsx`
- Test: `backend/apps/api/test/admin.integration.test.ts`
- Test: `frontend/apps/web/src/components/admin-access.test.ts`
- Create: `frontend/apps/web/src/components/admin-workspace.test.tsx`
- Create: `frontend/apps/web/src/lib/admin-api.test.ts`

**Interfaces:**
- Consumes: Existing `GET/PATCH/DELETE /v1/admin/media`, `POST /v1/admin/media/:id/transcode`, `GET /v1/admin/media/:id/transcode-jobs`, and `GET /v1/admin/transcode-jobs/:id`.
- Produces: Typed admin client functions for list/update/delete/trigger transcode/job status, plus UI state mapping `DRAFT`, `READY`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`.

- [ ] **Step 1: Add failing admin API and permission tests.**
  Cover missing token, non-admin token, malformed update payload, delete, retry, and job status parsing. Assert admin routes never render mutation controls for `USER`.

- [ ] **Step 2: Implement typed admin API methods.**
  Add `AdminMediaRecordSchema` and `AdminMediaListResponseSchema` in `shared/contracts/src/admin.ts`, reuse `TranscodeJobStatusResponseSchema` for job detail, and implement the methods in `admin-api.ts`. Return structured `{ data, error }` results so the UI can preserve the current item after transient failures.

- [ ] **Step 3: Build media inventory and editor.**
  Add tabs/filters for all, draft, ready, and processing/failed derived from jobs. Allow editing title, slug, type, duration, album/artists, and status. Require a confirmation for delete and show the resulting catalog visibility.

- [ ] **Step 4: Build job status and retry controls.**
  Poll only selected active jobs with cancellation on unmount. Show queued/processing/completed/failed states, last error, and retry action. Disable duplicate retry while a request is in flight.

- [ ] **Step 5: Integrate upload refresh.**
  After `completeUpload`, refresh the inventory and select the new draft. Preserve the existing direct-to-object-storage flow and validation limits.

- [ ] **Step 6: Verify Admin Studio.**
  Run `pnpm --filter @streamflow/api test -- admin.integration.test.ts`, `pnpm --filter @streamflow/web test`, `pnpm --filter @streamflow/web typecheck`, and `pnpm --filter @streamflow/web build`.
  Expected: non-admins cannot access mutations; admins can edit, publish/unpublish, delete, retry and observe jobs.

- [ ] **Step 7: Commit the independently shippable milestone.**
  Commit with `feat: add admin media and transcode management`.

### Task 3: Nâng cấp player, search và UX nền tảng

**Files:**
- Modify: `shared/contracts/src/catalog.ts`
- Modify: `backend/apps/api/src/media/media.controller.ts`
- Modify: `backend/apps/api/src/media/media.service.ts`
- Modify: `backend/packages/database/src/catalog-repository.ts`
- Modify: `frontend/apps/web/src/lib/media-api.ts`
- Modify: `frontend/apps/web/src/lib/search-state.ts`
- Modify: `frontend/apps/web/src/components/search-surface.tsx`
- Modify: `frontend/apps/web/src/components/player-shell.tsx`
- Modify: `frontend/apps/web/src/components/video-player.tsx`
- Modify: `frontend/apps/web/src/components/feedback-state.tsx`
- Test: `shared/contracts/src/catalog.test.ts`
- Test: `backend/apps/api/test/catalog.integration.test.ts`
- Test: `frontend/apps/web/src/lib/search-state.test.ts`
- Test: `frontend/apps/web/src/lib/media-api.test.ts`
- Test: `frontend/apps/web/src/components/player-feedback.test.tsx`
- Create: `frontend/apps/web/src/components/player-controls.test.tsx`

**Interfaces:**
- Consumes: Existing cursor pagination, media detail/playback manifest, HLS.js integration, and `FeedbackState` patterns.
- Produces: Search query fields for sort plus bounded duration/date filters; player controls for playback rate and keyboard/ARIA behavior. Subtitle support is included only when a subtitle asset URL is present in the playback contract; otherwise it remains a follow-up contract change.

- [ ] **Step 1: Pin query behavior with failing tests.**
  Add contract and client tests for sort/filter serialization, empty values, cursor preservation, and invalid range rejection. Add backend integration cases proving filters apply before pagination.

- [ ] **Step 2: Implement search contract and backend query.**
  Extend `SearchQuerySchema` with `sort: recent | title_asc`, `minDurationMs`, `maxDurationMs`, and optional `publishedAfter`/`publishedBefore`. Update `catalog-repository.ts` to encode the sort key and media ID in the cursor, accept legacy recent cursors, and apply filters before pagination. Keep the current recent ordering as the default.

- [ ] **Step 3: Implement search controls.**
  Add sort and filter controls to `search-surface.tsx`, mirror state into the URL, reset cursor when a filter changes, and preserve the current result on request errors.

- [ ] **Step 4: Add player controls and accessibility.**
  Add playback-rate selection, visible buffering/error recovery, labelled controls, keyboard focus order, and `aria-live` announcements. Keep HLS quality selection and progress synchronization intact.

- [ ] **Step 5: Add UX states and optional captions hook.**
  Ensure home, search, library, detail, and admin surfaces have distinct loading, empty, error, and retry states. Render a caption track only from a validated subtitle URL; do not fabricate a source.

- [ ] **Step 6: Verify search/player UX.**
  Run `pnpm --filter @streamflow/contracts test`, `pnpm --filter @streamflow/api test -- catalog.integration.test.ts`, `pnpm --filter @streamflow/web test`, `pnpm --filter @streamflow/web typecheck`, and `pnpm --filter @streamflow/web build`.
  Expected: existing catalog/search/playback tests remain green and new control/accessibility tests pass.

- [ ] **Step 7: Commit the independently shippable milestone.**
  Commit with `feat: improve search and playback experience`.

### Task 4: Hardening, end-to-end acceptance and release

**Files:**
- Create or modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`
- Modify: `docs/ui/README.md`
- Modify: `docs/security/threat-model-and-hardening.md`
- Modify: `docs/runbooks/deployment-and-rollback.md`
- Modify: `docs/runbooks/disaster-recovery-and-backup.md`
- Create: `docs/acceptance/website-feature-checklist.md`
- Modify: `infra/monitoring/alerts.yml` when a new metric is required

**Interfaces:**
- Consumes: Completed user/admin flows from Tasks 1–3, Compose/Testcontainers services, existing health/metrics endpoints, and current observability runbooks.
- Produces: Repeatable acceptance coverage and release checklist for auth → catalog → playlist → upload → transcode → playback.

- [ ] **Step 1: Write the acceptance matrix.**
  Document actor, preconditions, request sequence, expected UI state, API invariant, and cleanup for guest, user, and admin flows.

- [ ] **Step 2: Add end-to-end tests.**
  Cover registration/login, catalog/search, favorite/history, playlist CRUD/reorder conflict, admin upload/processing/publish, playback/resume, logout, and direct URL authorization. Use legal seeded media and deterministic cleanup.

- [ ] **Step 3: Run security and reliability checks.**
  Verify RBAC, signed URL expiry, upload MIME/size validation, rate limits, CORS/CSRF behavior, retry/idempotency, Redis degradation, transcode failure recovery, and backup restore drill using the existing scripts and test helpers.

- [ ] **Step 4: Run the full verification suite.**
  Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `node scripts/acceptance.test.mjs`, and the repository's layout/security/compose checks.
  Expected: all required checks pass; any environment-only failure is recorded with the exact command and reason.

- [ ] **Step 5: Update release documentation.**
  Record routes, screenshots, known limits, supported browsers, content-rights policy, rollback steps, and the deferred P2 list: recommendations, social, payment, live, DRM, native mobile, multi-region, and offline/PWA.

- [ ] **Step 6: Commit the release hardening milestone.**
  Commit with `chore: harden website release checks`.

## Suggested execution order

1. Task 1: user library completion, because playlists/history/profile are the largest user-facing gaps and establish reusable authenticated API patterns.
2. Task 2: Admin Studio, because the backend already exposes the required operations and the UI is the main missing layer.
3. Task 3: player/search/UX, because it touches shared contracts and should follow the stable user/admin flows.
4. Task 4: acceptance and hardening, after all product flows exist.

Recommendation, social, payment, live streaming, DRM, native mobile, multi-region and offline/PWA remain explicitly deferred until the MVP acceptance suite is green.
