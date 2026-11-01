# StreamFlow — Capacity Planning, Network Egress & Cost Estimation Model

- **Scope:** 100, 1,000, and 10,000 Concurrent Playback Viewers
- **Author:** StreamFlow Infrastructure & Architecture Team
- **Status:** Final / Milestone 12 Capstone

---

## 1. Concurrency Tiers & Bandwidth Demand

Video on Demand (VOD) streaming bandwidth demand scales directly with active viewer counts and stream bitrates. Using StreamFlow's Adaptive Bitrate (ABR) ladder (1080p @ 4.5 Mbps, 720p @ 2.5 Mbps, 480p @ 1.2 Mbps, 360p @ 600 kbps), we assume an industry-standard **blended average bitrate of 3.0 Mbps** per active session.

### 1.1 Capacity Sizing Table

| Concurrent Viewers | Avg Bitrate | Raw Peak Egress | CDN Cache Hit (95%) | Origin Egress Required | Minimum API Replicas |
|---:|---:|---:|---:|---:|---:|
| **100** | 3.0 Mbps | 300 Mbps | 95% | **15 Mbps** | 2 replicas |
| **1,000** | 3.0 Mbps | 3.0 Gbps | 95% | **150 Mbps** | 2–4 replicas |
| **10,000** | 3.0 Mbps | 30.0 Gbps | 95% | **1.5 Gbps** | 6–10 replicas |

---

## 2. Monthly Data Transfer & CDN Economics

Assuming an average viewing consumption of **2 hours per day per user** across a 30-day billing cycle:

- **Daily Streaming Seconds per User:** $2 \times 3,600\text{ s} = 7,200\text{ s}$.
- **Daily Data Volume per User:** $7,200\text{ s} \times 3\text{ Mbps} = 21,600\text{ Mb} = 2.7\text{ GB}$.
- **Monthly Data Egress for 10,000 Users:**
  $$10,000\text{ users} \times 2.7\text{ GB/day} \times 30\text{ days} = 810,000\text{ GB} = \mathbf{810\text{ TB/month}}$$

### 2.1 CDN vs. Origin Cost Comparison (810 TB/Month)

| Provider / Architecture | Pricing Structure | Monthly Bandwidth Cost | Architectural Tradeoffs |
|---|---|---:|---|
| **AWS CloudFront** | Tiered $0.08–$0.04 / GB | **~$48,500** | Turnkey global PoPs, tight AWS ecosystem integration, high egress markup |
| **Fastly** | Tiered $0.08–$0.04 / GB | **~$42,000** | Exceptional edge programmability (VCL), premium pricing |
| **Cloudflare (Enterprise / R2)** | Flat commitment + Zero Egress on R2 | **~$4,500** | Zero data egress fee between R2 and Cloudflare CDN; substantial margin savings |
| **Self-Hosted Bare Metal Origin (Hetzner / OVH)** | Unmetered 10 Gbps uplink port | **~$850** | Lowest possible cost; requires custom Geo-DNS and multi-datacenter redundancy |

**Key Takeaway:** Delivering 30 Gbps directly from cloud object storage (e.g. S3 direct egress) without a caching CDN would cost over $50,000/month. A 95% CDN edge cache hit ratio reduces origin egress to just 1.5 Gbps, making origin hosting commercially viable on modest infrastructure.

---

## 3. Backend & Infrastructure Sizing Matrix

### 3.1 HTTP API Sizing (Arrival-Rate Model)
- **Workload:** 10,000 concurrent viewers emitting playback telemetry every 10 seconds:
  $$\text{Telemetry Load} = \frac{10,000}{10} = \mathbf{1,000\text{ RPS}}$$
- Plus 50 RPS catalog browsing and discovery traffic = **1,050 total RPS**.
- Fastify on Node.js 22 handles ~4,500 RPS per vCPU core for lightweight JSON handlers.
- **Sizing:** 2 to 4 API replicas (each with `cpu: 500m, memory: 512Mi`) comfortably absorb the load at under 30% CPU utilization.

### 3.2 Database Connection Pool & Outbox Throughput
- 1,000 progress telemetry updates per second write directly to `playback_progress` with monotonic sequence guards.
- PostgreSQL easily handles 3,000–5,000 write TPS on standard NVMe SSDs.
- **Sizing:** A connection pool of 10 connections per API replica (max 100 total connections across 10 replicas) with `statement_timeout = 5000` prevents pool exhaustion, well within PostgreSQL's default `max_connections = 200`.

### 3.3 Redis Caching & Queue Backlog
- **Catalog & Detail Cache:** 10,000 active media items cached at ~2 KB per payload = ~20 MB RAM.
- **Singleflight Promise Map:** In-flight memory map consumes < 5 MB during peak concurrency.
- **BullMQ Queue Backlog:** 500 queued jobs stored in Redis consume < 10 MB.
- **Sizing:** 512 MB Redis instance with `maxmemory-policy allkeys-lru` provides 25× safety margin.

### 3.4 Kafka Partitioning & Storage Retention
- **Topic:** `media-playback-events` with **3 partitions** partitioned by `mediaId`.
- **Throughput:** 1,050 messages/sec $\times$ 500 bytes/msg $\approx$ 525 KB/sec = 1.89 GB/hour.
- **Sizing:** 3-day message retention requires ~136 GB disk storage.
