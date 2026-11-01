# Milestone 05 Specification: Media Pipeline & HLS Transcoding

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M05 (Weeks 9–10)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 05 introduces asynchronous media processing and Adaptive Bitrate (ABR) video streaming using **FFmpeg** and **HTTP Live Streaming (HLS)**:
1. **Transcoding Worker Service (`backend/apps/media-worker`):**
   - Implemented as an independent processing worker.
   - Probes source media using `ffprobe` to determine dimensions, duration, and codecs.
   - Constructs an adaptive bitrate ladder (360p, 720p, 1080p) tailored to the source resolution (strict **no-upscaling invariant**: a 720p source never generates an unhelpful 1080p rendition).
   - Segments video into 4-second MPEG-TS chunks with variant playlists and an overarching `master.m3u8` manifest.
   - Automatically extracts a high-quality JPEG poster thumbnail at the 3-second mark.
2. **Atomic Publication & Failure Isolation:**
   - Transcoding outputs are generated in temporary staging storage namespaces.
   - Complete output validation: manifests are verified for syntax validity and segment existence.
   - Transition to `READY` happens strictly after all artifacts exist. Corrupted input marks the job `FAILED` and leaves media unpublished (no partial outputs exposed).
3. **Job Lifecycle Tracking (`transcode_jobs`):**
   - Database table tracking transcode jobs with status (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`), attempts, and progress percentage.
4. **Web HLS Player (`frontend/apps/web`):**
   - Client player integrating `hls.js` with manual and automatic quality level selection (Auto, 1080p, 720p, 360p) and native HLS fallback for Safari/iOS.
   - Seek controls and buffering state indicators.
5. **Educational Experiments:**
   - Experiment 1: Measuring transcoding CPU/RAM utilization and duration across rendition profiles.
   - Experiment 2: Simulated network throttling demonstrating adaptive bitrate switching from 720p to 360p without playback interruption.
6. **Architecture Decision Record (ADR-005):** HLS Adaptive Streaming Architecture & Origin Decoupling.

---

## 2. Database Schema (`transcode_jobs`)

Added to `backend/packages/database/src/schema.ts`:

### 2.1 Enums
- `transcode_status`: `'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'`

### 2.2 Table Definition: `transcode_jobs`
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `mediaId`: `uuid`, not null, foreign key references `media(id)` ON DELETE CASCADE.
- `sourceAssetId`: `uuid`, not null, foreign key references `media_assets(id)` ON DELETE CASCADE.
- `profileVersion`: `integer`, not null, default `1`.
- `status`: `transcode_status`, not null, default `'QUEUED'`.
- `progressPercent`: `integer`, not null, default `0`.
- `attempts`: `integer`, not null, default `0`.
- `errorMessage`: `text`, nullable.
- `createdAt`: `timestamp with time zone`, not null, default `now()`.
- `updatedAt`: `timestamp with time zone`, not null, default `now()`.
- Indices:
  - `uniqueIndex on (media_id, source_asset_id, profile_version)`.
  - `index on (status, created_at)`.

---

## 3. Media Pipeline Architecture (`backend/apps/media-worker`)

### 3.1 Probing & Rendition Ladder
- Probing extracts: `width`, `height`, `duration`, `codec_name`, `bit_rate`.
- Bitrate & Resolution Ladder:
  - **1080p (FHD):** 1920x1080, video bitrate 4500k, audio bitrate 192k (Only if `source.height >= 1080`).
  - **720p (HD):** 1280x720, video bitrate 2200k, audio bitrate 128k (Only if `source.height >= 720`).
  - **360p (SD):** 640x360, video bitrate 800k, audio bitrate 96k (Always generated as baseline).
- Output structure in storage:
  - `hls/{mediaId}/master.m3u8`
  - `hls/{mediaId}/360p.m3u8`, `360p_000.ts`, `360p_001.ts`...
  - `hls/{mediaId}/720p.m3u8` (if applicable)
  - `hls/{mediaId}/1080p.m3u8` (if applicable)
  - `thumbnails/{mediaId}/poster.jpg`

### 3.2 Transcoding Execution & Validation
1. Worker claims job and updates `status = 'PROCESSING'`.
2. FFmpeg command parameters:
   `-c:v libx264 -preset fast -g 48 -keyint_min 48 -sc_threshold 0 -c:a aac -ar 48000 -hls_time 4 -hls_playlist_type vod`
3. Poster thumbnail command:
   `-ss 00:00:03 -i input -vframes 1 -q:v 2 output.jpg`
4. Post-transcode verification:
   - Validates that master playlist has `#EXT-X-STREAM-INF` entries.
   - Validates that variant playlists have `#EXTINF:4.000` tags and matching `.ts` segment files.
5. Atomic publication:
   - Registers `media_assets` rows for master playlist, variant playlists, and thumbnail.
   - Updates `media.status = 'READY'`.
   - Updates `transcode_jobs.status = 'COMPLETED'`, `progressPercent = 100`.

---

## 4. Playback Endpoints (`backend/apps/api`)

| Method | Route | Description |
|---|---|---|
| `GET` | `/v1/playback/:id/manifest` | Returns manifest URL/details for media player |
| `GET` | `/v1/playback/:id/thumbnail` | Returns poster thumbnail asset information |

---

## 5. Web Player Integration (`frontend/apps/web`)

1. **`MediaPlayer` Component:**
   - Wraps HTML5 `<video>` element with `hls.js`.
   - Auto-detects `Hls.isSupported()`; falls back to native HLS on Safari/iOS.
   - Quality Level Selector: dropdown with options `Auto`, `1080p`, `720p`, `360p`.
   - Custom playback controls: Play/Pause, Seek bar, Volume, Duration display.
2. **Catalog Integration:**
   - Clicking a ready video item in the catalog navigates to player view or opens inline modal player.

---

## 6. Definition of Done
1. Database migration applied with `transcode_jobs` table and enums.
2. `media-worker` service implemented, probing media and transcoding video to HLS.
3. Rendition ladder respects source dimensions (no upscaling).
4. Corrupted/invalid sources fail gracefully without publishing partial artifacts.
5. Playback manifest endpoint and Next.js HLS video player working with quality switching and seek.
6. Experiment 1: Transcoding duration and CPU/RAM usage recorded.
7. Experiment 2: Network throttling and adaptive bitrate switching demonstrated.
8. ADR-005 documented and committed.
9. 100% tests passing, clean Biome, clean Typecheck, clean build.
