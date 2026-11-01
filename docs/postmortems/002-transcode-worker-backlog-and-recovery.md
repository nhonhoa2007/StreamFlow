# Postmortem 002: Media Worker Failure & Queue Backlog Draining

- **Incident Date:** 2026-11-01
- **Severity:** SEV-3 (Background Processing Backlog, Zero API Disruption)
- **Status:** Resolved / Postmortem Complete
- **Lead Responders:** StreamFlow Media Pipeline Team

---

## 1. Summary

At 16:30 UTC, the `media-worker` container crashed due to an unhandled SIGSEGV in a third-party shared FFmpeg library dependency during hardware acceleration probing. While the worker was offline, users continued to upload videos and create media drafts normally via `POST /v1/admin/uploads/:id/complete`. BullMQ persisted 42 pending transcode jobs in Redis. Following worker restart with software encoding fallback, all 42 queued jobs were processed in bounded concurrency waves (`concurrency: 2`) with zero duplicate artifacts and zero partial `READY` state corruption.

---

## 2. Timeline

- **16:30:12 UTC** — `media-worker` process terminated unexpectedly.
- **16:31:00 UTC** — Client upload completions continued to return 202 Accepted; BullMQ stored pending jobs.
- **16:41:00 UTC** — Prometheus alert `QueueLagHigh` fired as waiting jobs reached 42.
- **16:45:00 UTC** — Engineer identified crash log in worker container; deployed updated worker image with software transcode fallback.
- **16:47:00 UTC** — Worker restarted, cleanly claimed jobs from Redis via BullMQ, and resumed transcoding at bounded concurrency (2 jobs simultaneously).
- **17:15:00 UTC** — Queue backlog reached 0; all 42 media items atomically promoted to `READY`. Incident closed.

---

## 3. Impact

- **API Availability:** 100% (upload initialization and completion endpoints functioned normally).
- **Processing Delay:** Newly uploaded videos remained in `DRAFT` state for up to 45 minutes instead of normal 2-minute processing SLA.
- **Data Integrity:** 0 broken or partial playlists published.

---

## 4. Root Cause

Missing fallback flag in FFmpeg configuration when hardware VAAPI device was unavailable in container runtime.

---

## 5. Corrective Actions

1. Enabled automatic fallback to CPU libx264 software transcoding in `ffmpeg.util.ts`.
2. Configured Docker Compose `restart: unless-stopped` with healthchecks on media worker.
3. Added queue backlog depth metric to primary Grafana overview dashboard.
