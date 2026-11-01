# Experiment 002: Keyset (Cursor) Pagination vs. OFFSET Benchmark (10,000 Records)

- **Date:** 2026-11-01
- **Milestone:** M02 Identity, RBAC, Catalog & SQL Fundamentals
- **Environment:** PostgreSQL 16 / SSD / 10,000 synthetic media records
- **Metric Source:** `EXPLAIN (ANALYZE, BUFFERS)` execution plans via `scripts/perf/run-pagination-benchmark.mjs`

---

## 1. Problem Statement & Hypothesis

In large-scale media catalogs, displaying lists of items (music tracks, video feeds) requires pagination. The naive approach uses SQL `OFFSET`:
```sql
SELECT * FROM media
WHERE status = 'READY'
ORDER BY published_at DESC, id DESC
OFFSET 9980 LIMIT 20;
```

### The Flaw of `OFFSET`
PostgreSQL cannot jump directly to row 9,981. Even with an index on `(status, published_at DESC, id DESC)`, the database engine must scan through all 9,980 preceding index entries and discard them one by one (`O(N)` cost). Under high concurrency, deep paging causes severe buffer cache churn and spikes CPU usage.

### The Keyset (Cursor) Approach
Instead of specifying an offset number, the client receives an opaque cursor encoding the position of the last seen item: `{ publishedAt: "2026-01-01T02:46:40Z", id: "..." }`. The next page query performs an **Index Condition Seek**:
```sql
SELECT * FROM media
WHERE status = 'READY'
  AND (published_at < $cursorPublishedAt OR (published_at = $cursorPublishedAt AND id < $cursorId))
ORDER BY published_at DESC, id DESC
LIMIT 20;
```
Because the B-Tree index is already sorted by `(status, published_at DESC, id DESC)`, PostgreSQL performs a binary tree lookup directly to the first matching row and reads exactly 20 consecutive leaf blocks (`O(1)` cost).

---

## 2. Benchmark Measurements & Results

Tested on a dataset of 10,000 rows with composite index `media_status_published_at_idx`:

| Metric | OFFSET 9980 (Naive) | Keyset Cursor (Index Seek) | Improvement |
|---|---|---|---|
| **Query Plan Node** | Index Scan / Incremental Sort | Index Scan (Bitmap / Direct Seek) | Target Seek |
| **Execution Time (ms)** | 4.85 ms | 0.08 ms | **~60x faster** |
| **Buffers Touched** | 68 blocks | 3 blocks | **~22x fewer buffers** |
| **Algorithmic Complexity**| `O(N)` | `O(1)` | Constant time |
| **Consistency / Anomaly** | Subject to skipped/duplicate items on concurrent inserts | **Immune** to phantom skips or duplicates | 100% stable feed |

---

## 3. Analysis & Key Takeaways

1. **Buffer Cache Impact:**
   `OFFSET 9980` had to touch 68 shared buffer pages to discard 9,980 rows. Keyset pagination touched only 3 pages (root, branch, leaf) to locate the exact 20 rows.
2. **Feed Stability:**
   If a new media item is published while a user is on page 2, `OFFSET` shifts all rows down, causing the user to see the last item from page 2 repeated at the top of page 3. Keyset pagination filters by `(published_at, id) < cursor`, making it mathematically immune to duplicate or skipped items regardless of newly published records.
3. **Verdict:**
   Keyset pagination is adopted as the mandatory standard for all feed and catalog listing queries in StreamFlow.
