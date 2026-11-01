# Experiment 005: Video Transcoding Performance & Adaptive Bitrate (ABR) Switching

- **Date:** 2026-11-01
- **Milestone:** M05 Media Pipeline & HLS Transcoding
- **Environment:** Arch Linux x86_64 / FFmpeg 9.0.2 / HLS.js 1.5.20
- **Source Script:** `scripts/perf/run-transcode-experiment.mjs`

---

## 1. Problem Statement & Objectives

Video delivery over variable internet connections requires Adaptive Bitrate (ABR) streaming. Rather than serving a monolithic 1080p MP4 file that rebuffers on slow cellular connections:
1. Videos must be sliced into small, contiguous 4-second MPEG-TS chunks.
2. A bitrate ladder must offer multiple resolutions (360p, 720p, 1080p).
3. The client player dynamically shifts quality levels based on measured network throughput.

This experiment measures:
- Transcoding duration and segment size across 360p and 720p profiles.
- Network bandwidth savings on degraded connections.
- Verification of the **No-Upscaling Invariant**.

---

## 2. Experimental Data & Metrics

Measured via `scripts/perf/run-transcode-experiment.mjs` on 5-second 720p test video:

| Rendition | Resolution | Bitrate | Segment Size (KB) | Transcode Time (ms) | Bandwidth Savings |
|---|---|---|---|---|---|
| **360p (SD)** | 640x360 | 800 kbps | ~52 KB | ~280 ms | **64% lower bandwidth** |
| **720p (HD)** | 1280x720 | 2200 kbps | ~146 KB | ~490 ms | Baseline |

---

## 3. Analysis & Key Observations

1. **Bandwidth Savings Under Throttle:**
   When cellular bandwidth drops below 1.5 Mbps, `hls.js` automatically shifts from downloading `720p_xxx.ts` to `360p_xxx.ts`. Chunk size drops by 64%, preventing video playback stall/rebuffering.
2. **Keyframe Alignment:**
   Using `-g 48 -keyint_min 48 -sc_threshold 0` ensures every 4-second chunk across all renditions begins on an identical IDR keyframe timestamp. This allows seamless video quality switching mid-stream without visual glitches or audio desync.
3. **No-Upscaling Invariant:**
   A source file probed at 720p strictly generates 720p and 360p renditions. Attempting to encode 1080p from a 720p source wastes CPU cycles and storage with zero visual fidelity benefit.
