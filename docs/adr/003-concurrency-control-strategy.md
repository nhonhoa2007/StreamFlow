# ADR-003: Concurrency Control Strategy: Optimistic Locking & Monotonic Sequences

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

A video-on-demand and music streaming platform has two distinct classes of concurrent write operations:
1. **Interactive Content Authoring (Playlists & Collections):** Multiple devices or tabs belonging to the same user can concurrently add, delete, or reorder items.
2. **High-Frequency Asynchronous Telemetry (Playback Progress):** Video players emit periodic progress pings over variable network connections (mobile/WiFi) where packets can be delayed, reordered, or duplicated.

Without concurrency controls, playlists suffer from **Lost Updates** and corrupted ordering, while playback progress suffers from **Out-of-Order Overwrites** (a stale ping reverting a newer resume position).

Two primary concurrency paradigms were evaluated:
- **Pessimistic Locking (`SELECT FOR UPDATE`):** Holds database row/table locks across the entire read-compute-write cycle.
- **Optimistic Concurrency Control (OCC) & Conditional Upserts:** Verifies state invariants at write time using version numbers and sequence comparisons.

---

## Decision

We decide on **Optimistic Concurrency Control (OCC)** for interactive editing and **Monotonic Conditional Upserts** for telemetry:

1. **Playlist Versioning (OCC):**
   - Add a `version integer NOT NULL DEFAULT 1` to `playlists`.
   - Every mutation and reorder requires `expectedVersion`.
   - The update atomically executes `WHERE id = $id AND version = $expectedVersion`.
   - If version mismatches, abort and return **`409 Conflict`**. The client is instructed to refresh and reconcile.
2. **Atomic Reorder Transactions:**
   - Reordering updates the playlist version and all contiguous item positions (`0..N-1`) within a single database transaction.
   - Enforce an invariant that the item IDs submitted must match the exact count and identities of existing items.
3. **Monotonic Telemetry Sequencing:**
   - Every playback session tracks monotonic integer sequences (`1, 2, 3...`).
   - `playback_progress` updates use conditional upserts:
     `SET ... WHERE playback_progress.last_sequence < EXCLUDED.last_sequence`.
   - Out-of-order or duplicate packets (`sequence <= current`) are safely ignored with `{ status: "ignored", reason: "stale_sequence" }`.
4. **Idempotent Favorites:**
   - Primary key on `(user_id, media_id)` ensures that `POST` and `DELETE /v1/media/:id/favorite` can be replayed safely without creating duplicate rows or unhandled errors.

---

## Consequences

### Positive
- **High Throughput:** Zero blocking row locks held during client think time.
- **Lost Update Prevention:** Concurrent playlist edits fail cleanly with `409 Conflict` instead of silently clobbering edits.
- **Immunity to Network Reordering:** Resume points never regress when older telemetry packets arrive late.
- **Idempotency:** Clients can safely retry network requests without side effects.

### Negative / Tradeoffs
- **Client Reconciliation:** On `409 Conflict`, the frontend UI must handle the error by refetching the latest playlist state and prompting the user.
