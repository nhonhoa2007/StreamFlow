# ADR-005: HLS Adaptive Streaming Architecture & Origin Decoupling

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

Video on Demand (VOD) platforms must serve smooth video across diverse client devices (smartphones, 4K TVs, laptops) over heterogeneous network conditions (4G/5G, fiber, patchy Wi-Fi).

Three streaming approaches were evaluated:
1. **Option A: Progressive MP4 Download over HTTP Range:**
   - Single static MP4 file served with HTTP 206 Partial Content byte ranges.
   - *Downside:* No adaptive bitrate switching; a 1080p file stalls on slow mobile networks, and a 360p file looks pixelated on large displays.
2. **Option B: Dynamic On-the-Fly Transcoding:**
   - Server decodes and transcodes video on demand as requests arrive.
   - *Downside:* Immense CPU usage, server saturation, and latency lag.
3. **Option C: Ahead-of-Time (AOT) HLS Segmentation & Multi-Rendition Bitrate Ladder:**
   - Worker pre-transcodes source video into 4-second `.ts` segments across multiple fixed profiles (360p, 720p, 1080p).
   - Generates variant manifests and a unified `master.m3u8` playlist.
   - Client players (hls.js / AVPlayer) measure buffer occupancy and bandwidth, dynamically selecting the optimal variant.

---

## Decision

We decide on **Option C (AOT HLS Adaptive Streaming)**:
1. **Worker Isolation (`backend/apps/media-worker`):**
   - Transcoding is CPU-heavy and strictly executed outside the API control plane.
2. **Strict No-Upscaling Invariant:**
   - The worker probes source video with `ffprobe` and only constructs rendition profiles whose vertical resolution is less than or equal to the source height.
3. **Chunk Segmentation Standard:**
   - Segment length: 4 seconds.
   - Video codec: H.264 (libx264) with fixed GOP size (`-g 48 -keyint_min 48 -sc_threshold 0`) to guarantee keyframe synchronization across profiles.
   - Audio codec: AAC at 48 kHz.
4. **Client Player Integration:**
   - Browser client uses `hls.js` for MSE-supported modern browsers.
   - Safari / iOS automatically falls back to native HLS playback via `<video src="...">`.
5. **Decoupled Delivery:**
   - The Node.js API only serves metadata manifests. The actual media chunks (`.ts`) are cached at the edge or served directly from object storage (MinIO / Cloudflare R2).

---

## Consequences

### Positive
- **Adaptive Bitrate Streaming:** Zero playback interruption when client network bandwidth fluctuates.
- **Fast Startup & Low Latency:** Small 4-second initial chunks allow rapid playback startup.
- **Cacheability:** Static `.ts` segments are immutable and perfectly cacheable by CDNs (Cloudflare Edge).

### Negative / Tradeoffs
- **Storage Expansion:** Storing multiple renditions (360p + 720p + 1080p) multiplies raw storage footprint by ~1.5x–1.8x.
- **Processing Turnaround:** Videos require an asynchronous transcode step before becoming available for public streaming.
