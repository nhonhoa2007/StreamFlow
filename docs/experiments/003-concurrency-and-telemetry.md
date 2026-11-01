# Experiment 003: Concurrency Control (OCC) & Monotonic Playback Telemetry

- **Date:** 2026-11-01
- **Milestone:** M03 Library, Playlists, Progress & Concurrency Control
- **Environment:** PostgreSQL 16 / NestJS Fastify / Vitest Integration
- **Source Script:** `scripts/perf/run-concurrency-experiment.mjs`

---

## Part 1: Optimistic Concurrency Control (OCC) on Playlist Reorders

### Hypothesis & Challenge
In modern web applications, multiple client tabs or devices might attempt to reorder the same playlist simultaneously. Without concurrency guards:
1. **Lost Updates:** A client's changes overwrite another client's edits blindly without notice.
2. **Corrupted Ordering / Invariant Violation:** Partially applied position updates lead to duplicate positions (e.g., two items having `position = 0`), negative gaps, or deleted items.

### Implementation Strategy
We introduce an explicit `version` column on `playlists`. When a client requests a reorder (`PATCH /v1/playlists/:id/items/reorder`), it must supply `expectedVersion`.

Inside an atomic transaction:
```sql
UPDATE playlists
SET version = version + 1, updated_at = now()
WHERE id = $id AND owner_id = $userId AND version = $expectedVersion
RETURNING version;
```
If the row count is 0, another request has already incremented the version. The transaction aborts and returns **`409 Conflict`**.

### 20 Concurrent Requests Benchmark Results
We launched 20 concurrent reorder requests targeting the same initial version `V1`:

| Total Concurrent Requests | Successful (`200 OK`) | Rejected Conflicts (`409 Conflict`) | Data Invariants Preserved |
|---|---|---|---|
| **20** | **1** | **19** | **100% Contiguous (0..N-1), 0 Duplicates** |

### Takeaway
Optimistic Concurrency Control eliminates the overhead of long-lived pessimistic row locks (`SELECT FOR UPDATE`) while providing absolute mathematical protection against lost updates. The 19 conflicting clients receive a clean `409 Conflict` enabling the frontend to refresh state and prompt the user.

---

## Part 2: Monotonic Telemetry Packet Ordering

### Hypothesis & Challenge
Mobile and web players send progress heartbeats over unreliable cellular or Wi-Fi networks. Due to network retries, route changes, or packet delays, an older packet (e.g., `sequence = 2`, `position = 60s`) may reach the server **after** a newer packet (`sequence = 3`, `position = 90s`). If blindly written, the user's resume point would jump backwards from 90s to 60s.

### Implementation Strategy
1. Each playback session assigns a monotonic increasing sequence number (`1, 2, 3, ...`) to every progress heartbeat.
2. The database stores `last_sequence` in both `playback_sessions` and `playback_progress`.
3. An atomic upsert with guard condition ensures:
   ```sql
   INSERT INTO playback_progress (user_id, media_id, position_ms, last_sequence, updated_at)
   VALUES ($userId, $mediaId, $positionMs, $sequence, now())
   ON CONFLICT (user_id, media_id) DO UPDATE
   SET position_ms = EXCLUDED.position_ms,
       last_sequence = EXCLUDED.last_sequence,
       updated_at = now()
   WHERE playback_progress.last_sequence < EXCLUDED.last_sequence;
   ```

### Experimental Evidence
| Event Step | Sent Packet | Server Response | Stored Position in DB | Invariant Preserved |
|---|---|---|---|---|
| 1 | `sequence: 1, pos: 30s` | `status: "updated"` | 30s | Yes |
| 2 | `sequence: 3, pos: 90s` | `status: "updated"` | 90s | Yes |
| 3 (Delayed) | `sequence: 2, pos: 60s` | `status: "ignored", reason: "stale_sequence"` | **90s** (Unchanged) | **Yes (Never regresses)** |

### Takeaway
Out-of-order and duplicate telemetry packets are safely ignored at the database layer without crashing the client or causing resume regression.
