# StreamFlow M03 Library, Playlists, Progress & Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement user library favorites, playlists with optimistic locking and atomic reorder, playback sessions, and monotonic progress telemetry preventing out-of-order event overwrites.

**Architecture:** Add `LibraryModule`, `PlaylistModule`, and `PlaybackModule` to the NestJS modular monolith. Concurrency control uses OCC with `version` columns for playlists, composite primary keys for idempotent favorites, and monotonic sequence checks for playback telemetry. Client updates are supported by responsive Next.js library components.

**Tech Stack:** NestJS 11 + Fastify, Drizzle ORM + postgres.js, PostgreSQL 16, Zod, Next.js 15, Vitest, Testcontainers, Biome.

**Spec:** `docs/superpowers/specs/2026-11-01-m03-library-concurrency-design.md`

## Global Constraints

- Endpoints in M03 require authentication via `AuthGuard` (injected `req.user.sub`).
- Playlists are strictly scoped to their owner (`owner_id = user.id`); unauthorized access by another user throws 404/403.
- Playlist reorder requires `expectedVersion` and executes inside an isolated database transaction. If `version != expectedVersion`, throws `409 Conflict`.
- Favorites operations (`POST` and `DELETE /v1/media/:id/favorite`) are idempotent.
- Playback progress updates compare `sequence > last_sequence`. Stale or delayed packets are ignored without error.
- All code formatted and checked via Biome with zero warnings.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Concurrent reorders must not lose or duplicate playlist items, and conflicting updates must return 409 Conflict (Task 6).
2. Telemetry sequence 2 arriving after sequence 3 must be ignored, preserving the position from sequence 3 (Task 7).
3. Adding a favorite multiple times must be idempotent and never produce duplicate rows (Task 4).
4. User A must never be able to add items to, delete items from, or reorder User B's playlist (Task 5).
5. Deleting a media item or user must cascade cleanly to favorites, playlist items, and playback records (Task 1).

---

## File Map

- `backend/packages/database/src/schema.ts`: Define `favoritesTable`, `playlistsTable`, `playlistItemsTable`, `playbackSessionsTable`, `playbackProgressTable`.
- `backend/packages/database/drizzle/`: Generated migration `0002_library_and_concurrency.sql`.
- `backend/packages/database/src/{library-repository,playlist-repository,playback-repository}.ts`: Data access layer with transactions and OCC.
- `shared/contracts/src/{library,playlist,playback}.ts`: Zod schemas and TypeScript types.
- `backend/apps/api/src/library/{library.module,library.controller,library.service}.ts`: Favorites and continue watching.
- `backend/apps/api/src/playlist/{playlist.module,playlist.controller,playlist.service}.ts`: Playlists CRUD and atomic reorder.
- `backend/apps/api/src/playback/{playback.module,playback.controller,playback.service}.ts`: Playback sessions and telemetry progress.
- `frontend/apps/web/src/components/{favorite-button,playlist-view,continue-watching}.tsx`: Library components.
- `scripts/perf/run-concurrency-experiment.mjs` & `docs/experiments/003-concurrency-and-telemetry.md`: Concurrency test report.
- `docs/adr/003-concurrency-control-strategy.md`: ADR-003 documentation.

---

### Task 1: M03 Relational Schema & Migrations

**Files:**
- Modify: `backend/packages/database/src/schema.ts`
- Modify: `backend/packages/database/src/index.ts`
- Create: `backend/packages/database/drizzle/0002_library_and_concurrency.sql`
- Test: `backend/packages/database/test/database.integration.test.ts`

- [ ] **Step 1: Write failing integration test for M03 schema**
In `database.integration.test.ts`, assert that `favoritesTable`, `playlistsTable`, `playlistItemsTable`, `playbackSessionsTable`, and `playbackProgressTable` exist and enforce constraints (primary keys, foreign key cascading, composite unique index on `playlist_items(playlist_id, media_id)`).

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: FAIL on missing tables.

- [ ] **Step 3: Define schema in `schema.ts` & generate migration**
Add definitions for `favoritesTable`, `playlistsTable`, `playlistItemsTable`, `playbackSessionsTable`, and `playbackProgressTable`. Run `pnpm --filter @streamflow/database db:generate`.

- [ ] **Step 4: Run integration test to verify success**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/
git commit -m "feat(database): add library, playlist, and playback schema tables"
```

---

### Task 2: Shared Contracts for Library, Playlists & Telemetry

**Files:**
- Create: `shared/contracts/src/library.ts`
- Create: `shared/contracts/src/playlist.ts`
- Create: `shared/contracts/src/playback.ts`
- Create: `shared/contracts/src/library.test.ts`
- Modify: `shared/contracts/src/index.ts`

- [ ] **Step 1: Write failing unit tests for M03 contracts**
In `library.test.ts`, test validation of `CreatePlaylistSchema`, `ReorderPlaylistItemsSchema`, `UpdateProgressSchema`, and `ContinueItemSchema`.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/contracts test`
Expected: FAIL on missing schemas.

- [ ] **Step 3: Implement Zod schemas in `library.ts`, `playlist.ts`, `playback.ts`**
Define schemas per spec section 3 and re-export in `index.ts`.

- [ ] **Step 4: Run test, build, and typecheck to verify success**
Run: `pnpm --filter @streamflow/contracts test && pnpm --filter @streamflow/contracts build && pnpm --filter @streamflow/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add shared/contracts/
git commit -m "feat(contracts): add library, playlist, and playback telemetry schemas"
```

---

### Task 3: Database Repositories: Library, Playlists & Playback

**Files:**
- Create: `backend/packages/database/src/library-repository.ts`
- Create: `backend/packages/database/src/playlist-repository.ts`
- Create: `backend/packages/database/src/playback-repository.ts`
- Modify: `backend/packages/database/src/index.ts`
- Test: `backend/packages/database/test/database.integration.test.ts`

- [ ] **Step 1: Write failing integration tests for repositories**
Test adding/removing favorites idempotently, creating playlist, adding items with auto-incremented position, atomic reordering in transaction, and monotonic progress upsert.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: FAIL on missing functions.

- [ ] **Step 3: Implement database repository functions**
Implement `addFavorite`, `removeFavorite`, `listFavorites`, `createPlaylist`, `getPlaylistDetail`, `addPlaylistItem`, `removePlaylistItem`, `reorderPlaylistItemsWithOCC`, `startPlaybackSession`, `updatePlaybackProgressMonotonic`, `getContinueWatching`.

- [ ] **Step 4: Run integration test to verify success**
Run: `pnpm --filter @streamflow/database test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/packages/database/
git commit -m "feat(database): implement library, playlist, and playback repositories"
```

---

### Task 4: Library & Favorites Endpoints

**Files:**
- Create: `backend/apps/api/src/library/library.service.ts`
- Create: `backend/apps/api/src/library/library.controller.ts`
- Create: `backend/apps/api/src/library/library.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Test: `backend/apps/api/test/library.integration.test.ts`

- [ ] **Step 1: Write failing integration tests for favorites**
Test `POST /v1/media/:id/favorite` (idempotent 200/201), `DELETE /v1/media/:id/favorite` (idempotent 200), and `GET /v1/library/favorites`. Ensure 401 when unauthenticated.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on missing `/v1/library` routes.

- [ ] **Step 3: Implement LibraryModule and endpoints**
Wire controller and service to `library-repository`.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(library): implement favorites and library endpoints"
```

---

### Task 5: Playlist Management & Ownership Protection

**Files:**
- Create: `backend/apps/api/src/playlist/playlist.service.ts`
- Create: `backend/apps/api/src/playlist/playlist.controller.ts`
- Create: `backend/apps/api/src/playlist/playlist.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Test: `backend/apps/api/test/playlist.integration.test.ts`

- [ ] **Step 1: Write failing tests for Playlist CRUD and ownership**
Test:
1. User A creates playlist.
2. User A adds items.
3. User B cannot view, modify, add items to, or delete User A's playlist (returns 404 or 403).
4. Deleting item adjusts remaining item order or removes row.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL.

- [ ] **Step 3: Implement PlaylistModule**
Implement `PlaylistService` and `PlaylistController` checking `ownerId === req.user.sub`.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(playlist): implement playlist management with ownership protection"
```

---

### Task 6: Atomic Playlist Reorder & Experiment 1 (Concurrency)

**Files:**
- Modify: `backend/apps/api/src/playlist/playlist.service.ts`
- Modify: `backend/apps/api/src/playlist/playlist.controller.ts`
- Test: `backend/apps/api/test/playlist.integration.test.ts`

- [ ] **Step 1: Write failing tests for atomic reorder & 20 concurrent requests**
Test:
1. Sequential reorder with valid `expectedVersion` updates order and increments version.
2. Reorder with stale `expectedVersion` returns 409 Conflict.
3. Experiment 1: Launch 20 concurrent reorder requests with `Promise.all` targeting the same initial version `V1`. Exactly 1 request succeeds (200), remaining 19 receive 409 Conflict. Final playlist retains all items with valid 0..N-1 positions.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL on missing reorder method.

- [ ] **Step 3: Implement OCC reorder endpoint**
Implement `PATCH /v1/playlists/:id/items/reorder` in `PlaylistController` and `PlaylistService`.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS with 100% invariant preservation.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(playlist): implement atomic playlist reorder with optimistic concurrency control"
```

---

### Task 7: Playback Telemetry & Experiment 2 (Stale Event Rejection)

**Files:**
- Create: `backend/apps/api/src/playback/playback.service.ts`
- Create: `backend/apps/api/src/playback/playback.controller.ts`
- Create: `backend/apps/api/src/playback/playback.module.ts`
- Modify: `backend/apps/api/src/app.module.ts`
- Test: `backend/apps/api/test/playback.integration.test.ts`

- [ ] **Step 1: Write failing tests for Playback sessions and telemetry**
Test:
1. `POST /v1/playback/:id/start` returns sessionId and initial positionMs (0 or last resume).
2. `PUT /v1/playback/sessions/:id/progress` updates progress with sequence 1, positionMs 30000.
3. Update with sequence 3, positionMs 90000 succeeds.
4. Experiment 2: Send delayed/stale sequence 2, positionMs 60000. Server ignores update, stored position remains 90000.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: FAIL.

- [ ] **Step 3: Implement PlaybackModule**
Implement `start` and `updateProgress` checking sequence monotonic invariant.

- [ ] **Step 4: Run integration tests to verify success**
Run: `pnpm --filter @streamflow/api test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add backend/apps/api/
git commit -m "feat(playback): implement playback sessions and monotonic progress telemetry"
```

---

### Task 8: Continue Watching & Web UI Integration

**Files:**
- Create: `frontend/apps/web/src/components/favorite-button.tsx`
- Create: `frontend/apps/web/src/components/continue-watching.tsx`
- Modify: `frontend/apps/web/src/components/catalog.tsx`
- Modify: `frontend/apps/web/src/app/page.tsx`
- Modify: `frontend/apps/web/src/lib/media-api.ts`
- Test: `frontend/apps/web/src/lib/media-api.test.ts`

- [ ] **Step 1: Write failing tests for Continue Watching fetch**
In `media-api.test.ts`, test `fetchContinueWatching()` and favorite toggle API calls.

- [ ] **Step 2: Run test to verify failure**
Run: `pnpm --filter @streamflow/web test`
Expected: FAIL.

- [ ] **Step 3: Implement UI components & API helpers**
Add Favorite button to media cards, Continue Watching carousel/row on home page.

- [ ] **Step 4: Run test, typecheck, and build to verify success**
Run: `pnpm --filter @streamflow/web test && pnpm --filter @streamflow/web typecheck && pnpm --filter @streamflow/web build`
Expected: PASS.

- [ ] **Step 5: Commit**
Run:
```bash
git add frontend/apps/web/
git commit -m "feat(web): add favorite button and continue watching section"
```

---

### Task 9: ADR-003, Concurrency Experiment Report & Acceptance

**Files:**
- Create: `scripts/perf/run-concurrency-experiment.mjs`
- Create: `docs/experiments/003-concurrency-and-telemetry.md`
- Create: `docs/adr/003-concurrency-control-strategy.md`
- Modify: `scripts/acceptance.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M03 deliverables**
In `scripts/acceptance.test.mjs`, assert `docs/adr/003-concurrency-control-strategy.md`, `docs/experiments/003-concurrency-and-telemetry.md`, and concurrency script exist.

- [ ] **Step 2: Run acceptance test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement ADR-003, experiment report, and update README**
Write documentation and update README with M03 endpoints and concurrency scripts.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
Run:
```bash
git add .
git commit -m "docs: add m03 concurrency experiment report, adr-003, and acceptance tests"
```
