# Postmortem 002: Media Worker Failure & Queue Backlog Draining

- **Incident Date:** 2026-11-01
- **Severity:** SEV-3 (Background Processing Backlog, Zero API Disruption)
- **Status:** Resolved / Postmortem Complete
- **Lead Responders:** StreamFlow Media Pipeline Team

---

## 1. Summary

At 16:30 UTC, the `media-worker` container crashed due to an unhandled SIGSEGV in a third-party shared FFmpeg library dependency during hardware acceleration probing. While the worker was offline, users continued to upload videos and create media drafts normally via `POST /v1/admin/uploads/:id/complete`. BullMQ persisted 65 pending transcode jobs in Redis. Following worker restart with software encoding fallback, all 65 queued jobs were processed in bounded concurrency waves (`concurrency: 2`) with zero duplicate artifacts and zero partial `READY` state corruption.

---

## 2. Trigger

An unexpected hardware acceleration probe against an unavailable VAAPI device driver caused an unhandled memory segmentation fault (`SIGSEGV`) in the FFmpeg sub-process.

---

## 3. Timeline

- **16:30:00 UTC** — `media-worker` process terminated unexpectedly.
- **16:30:10 UTC** — Client upload completions continued to return 202 Accepted; BullMQ stored pending jobs.
- **16:40:05 UTC** — Prometheus alert `QueueLagHigh` fired after waiting jobs exceeded 50 for 10 consecutive minutes (measured at 65 jobs).
- **16:45:00 UTC** — Engineer identified crash log in worker container; deployed updated worker image with software transcode fallback.
- **16:47:00 UTC** — Worker restarted, cleanly claimed jobs from Redis via BullMQ, and resumed transcoding at bounded concurrency (2 jobs simultaneously).
- **17:15:00 UTC** — Queue backlog reached 0; all 65 media items atomically promoted to `READY`. Incident closed.

---

## 4. Detection

Detected by Prometheus alert `QueueLagHigh` (`transcode_queue_waiting_jobs > 50 for 10m`) in Slack `#streamflow-alerts`.

---

## 5. Impact

- **API Availability:** 100% (upload initialization and completion endpoints functioned normally).
- **Processing Delay:** Newly uploaded videos remained in `DRAFT` state for up to 45 minutes instead of normal 2-minute processing SLA.
- **Data Integrity:** 0 broken or partial playlists published.

---

## 6. Root Cause

Missing fallback flag in FFmpeg configuration when hardware VAAPI device was unavailable in container runtime.

---

## 7. Corrective Actions

1. [Completed] Enabled automatic fallback to CPU libx264 software transcoding in `ffmpeg.util.ts`.
2. [Completed] Configured Docker Compose `restart: unless-stopped` with healthchecks on media worker.
3. [Completed] Added queue backlog depth metric to primary Grafana overview dashboard.
