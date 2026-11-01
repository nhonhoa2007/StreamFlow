# Milestone 03 Specification: Library, Playlists, Progress & Concurrency Control

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M03 (Weeks 5–6)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 03 addresses state concurrency, data invariants, and asynchronous client telemetry within StreamFlow:
1. **Personal Media Library & Favorites:** Idempotent additions/removals with composite unique constraints preventing duplicate rows.
2. **Playlists with Optimistic Concurrency Control (OCC):** Preventing lost updates during concurrent edits/reorders using a `version` column and atomic database transactions.
3. **Playback Telemetry & Out-of-Order Event Protection:** Storing playback progress using monotonic sequence counters per session to guarantee delayed or out-of-order network events (e.g. sequence 2 arriving after sequence 3) never overwrite newer player state.
4. **Continue Listening / Watching:** Aggregating recent playback progress for resume functionality.
5. **Concurrency & Telemetry Experiments:**
   - Experiment 1: 20 concurrent reorder requests on the same playlist, measuring conflict rate (`409 Conflict`) and verifying that items and positions remain intact.
   - Experiment 2: Stale telemetry rejection simulation (event sequence 3 followed by delayed sequence 2).
6. **Architecture Decision Record (ADR-003):** Concurrency Control Strategy (Optimistic vs. Pessimistic locking, monotonic event sequence invariants).

---

## 2. Database Schema & Relational Design

All schema definitions live in `backend/packages/database/src/schema.ts`.

### 2.1 Table Definitions

#### `favorites`
- `userId`: `uuid`, not null, foreign key references `users(id)` ON DELETE CASCADE.
- `mediaId`: `uuid`, not null, foreign key references `media(id)` ON DELETE CASCADE.
- `createdAt`: `timestamp with time zone`, not null, default `now()`.
- Primary Key: `(user_id, media_id)`.
- Index: `index on media_id` for reverse popularity counts.

#### `playlists`
- `id`: `uuid`, Primary Key, default `gen_random_uuid()`.
- `ownerId`: `uuid`, not null, foreign key references `users(id)` ON DELETE CASCADE.
- `name`: `varchar(255)`, not null.
- `description`: `text`, nullable.
- `version`: `integer`, not null, default `1` (Optimistic locking counter).
- `createdAt`: `timestamp with time zone`, not null, default `now()`.
- `updatedAt`: `timestamp with time zone`, not null, default `now()`.
- Indices:
  - `index on (owner_id, updated_at DESC)`.

#### `playlist_items`
- `id`: `uuid`, Primary Key, default `gen_random_uuid()`.
- `playlistId`: `uuid`, not null, foreign key references `playlists(id)` ON DELETE CASCADE.
- `mediaId`: `uuid`, not null, foreign key references `media(id)` ON DELETE CASCADE.
- `position`: `integer`, not null (0-indexed position within playlist).
- `addedAt`: `timestamp with time zone`, not null, default `now()`.
- Indices:
  - Unique index on `(playlist_id, media_id)` (no duplicate media in a single playlist).
  - Index on `(playlist_id, position)`.

#### `playback_sessions`
- `id`: `uuid`, Primary Key, default `gen_random_uuid()`.
- `userId`: `uuid`, not null, foreign key references `users(id)` ON DELETE CASCADE.
- `mediaId`: `uuid`, not null, foreign key references `media(id)` ON DELETE CASCADE.
- `lastSequence`: `integer`, not null, default `0`.
- `startedAt`: `timestamp with time zone`, not null, default `now()`.
- `endedAt`: `timestamp with time zone`, nullable.
- Index: `index on (user_id, media_id)`.

#### `playback_progress`
- `userId`: `uuid`, not null, foreign key references `users(id)` ON DELETE CASCADE.
- `mediaId`: `uuid`, not null, foreign key references `media(id)` ON DELETE CASCADE.
- `positionMs`: `integer`, not null, default `0`.
- `lastSequence`: `integer`, not null, default `0`.
- `updatedAt`: `timestamp with time zone`, not null, default `now()`.
- Primary Key: `(user_id, media_id)`.
- Index: `index on (user_id, updated_at DESC)` for "Continue Watching" feeds.

---

## 3. Shared Contracts (`shared/contracts`)

Exported from `@streamflow/contracts`:

### 3.1 Playlists & Items
- `CreatePlaylistSchema`: `{ name: string.min(1).max(255), description?: string.max(1000) }`.
- `UpdatePlaylistSchema`: `{ name?: string.min(1).max(255), description?: string.max(1000) }`.
- `AddPlaylistItemSchema`: `{ mediaId: string.uuid() }`.
- `ReorderPlaylistItemsSchema`:
  - `expectedVersion`: `z.number().int().positive()`.
  - `itemIds`: `z.array(z.string().uuid()).min(1)`.
- `PlaylistItemDetailSchema`:
  - `{ id: string, mediaId: string, position: number, addedAt: string, media: MediaItem }`.
- `PlaylistDetailSchema`:
  - `{ id: string, ownerId: string, name: string, description: string | null, version: number, items: PlaylistItemDetail[], createdAt: string, updatedAt: string }`.

### 3.2 Favorites & Library
- `FavoriteItemSchema`: `{ mediaId: string, createdAt: string, media: MediaItem }`.
- `ContinueItemSchema`: `{ mediaId: string, positionMs: number, updatedAt: string, media: MediaItem }`.

### 3.3 Playback Telemetry
- `StartPlaybackResponseSchema`: `{ sessionId: string, mediaId: string, positionMs: number }`.
- `UpdateProgressSchema`:
  - `sequence`: `z.number().int().positive()`.
  - `positionMs`: `z.number().int().nonnegative()`.
  - `playedAt`: `z.string().datetime().optional()`.

---

## 4. Concurrency Control & State Invariants

### 4.1 Lost Update Prevention on Playlists
When reordering playlist items (`PATCH /v1/playlists/:id/items/reorder`):
1. Client transmits `{ expectedVersion: V, itemIds: [id1, id2, ...] }`.
2. Execution runs inside an isolated PostgreSQL transaction:
   ```sql
   UPDATE playlists
   SET version = version + 1, updated_at = now()
   WHERE id = $id AND version = $expectedVersion
   RETURNING version;
   ```
3. If row count is 0, the version has changed concurrently: abort transaction and throw `409 Conflict` (`PLAYLIST_VERSION_CONFLICT`).
4. Otherwise, verify that `itemIds` exactly matches the existing set of playlist items (no dropped or injected IDs).
5. Bulk update new positions `0, 1, ..., N-1`.
6. Commit transaction.

### 4.2 Stale Event Rejection on Playback Progress
When receiving telemetry progress (`PUT /v1/playback/sessions/:sessionId/progress`):
1. Validate that the playback session exists and belongs to the authenticated user.
2. In `playback_progress` for `(userId, mediaId)`:
   - Check if current stored `last_sequence >= incoming.sequence`.
   - If true: **Ignore update** (stale out-of-order network packet) and return `{ status: "ignored", reason: "stale_sequence" }`.
   - If false: Upsert `playback_progress`:
     ```sql
     INSERT INTO playback_progress (user_id, media_id, position_ms, last_sequence, updated_at)
     VALUES ($userId, $mediaId, $positionMs, $sequence, now())
     ON CONFLICT (user_id, media_id) DO UPDATE
     SET position_ms = EXCLUDED.position_ms,
         last_sequence = EXCLUDED.last_sequence,
         updated_at = now()
     WHERE playback_progress.last_sequence < EXCLUDED.last_sequence;
     ```
   - Update `playback_sessions.lastSequence = incoming.sequence`.

---

## 5. Endpoints Specification

All endpoints in M03 require authentication (`AuthGuard`):

| Method | Route | Description |
|---|---|---|
| `POST` | `/v1/media/:id/favorite` | Idempotent add to favorites (returns 200/201) |
| `DELETE` | `/v1/media/:id/favorite` | Idempotent remove from favorites (returns 200) |
| `GET` | `/v1/library/favorites` | List authenticated user's favorites |
| `POST` | `/v1/playlists` | Create new playlist (version starts at 1) |
| `GET` | `/v1/playlists` | List user's playlists with item counts |
| `GET` | `/v1/playlists/:id` | Get playlist detail with items ordered by position |
| `POST` | `/v1/playlists/:id/items` | Add media to playlist (owner only) |
| `DELETE` | `/v1/playlists/:id/items/:itemId` | Remove item from playlist (owner only) |
| `PATCH` | `/v1/playlists/:id/items/reorder` | Atomic reorder with OCC `expectedVersion` |
| `POST` | `/v1/playback/:id/start` | Start playback session, fetch last known resume position |
| `PUT` | `/v1/playback/sessions/:id/progress`| Push progress telemetry with monotonic sequence |
| `GET` | `/v1/library/continue` | Fetch continue listening/watching list |

---

## 6. Definition of Done
1. Database schema migration applied with `favorites`, `playlists`, `playlist_items`, `playback_sessions`, `playback_progress`.
2. All 12 endpoints implemented, protected with `AuthGuard`, validating inputs via Zod.
3. Ownership security verified: User A cannot read, modify, add to, or reorder User B's playlists.
4. Experiment 1: 20 concurrent reorder requests demonstrate OCC conflict handling without invariant violation.
5. Experiment 2: Out-of-order telemetry rejection verified by automated tests.
6. ADR-003 documented and committed.
7. Web UI updated with favorites toggle, playlist manager, and continue watching feed.
8. 100% passing tests, clean Biome, clean Typecheck, clean production build.
