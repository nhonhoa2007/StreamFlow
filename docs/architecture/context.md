# StreamFlow — System Context (M01 Foundation)

```mermaid
C4Context
  title System Context Diagram - StreamFlow M01

  Person(user, "User / Developer", "Browses media catalog and inspects system health.")

  Enterprise_Boundary(b0, "StreamFlow System Boundary") {
    System(web, "StreamFlow Web", "Next.js 15 App Router client running on localhost:3001")
    System(api, "StreamFlow API", "NestJS Fastify modular monolith running on localhost:3000")
    SystemDb(db, "PostgreSQL 16", "Database running on localhost:5432 storing media metadata")
    SystemDb_Ext(storage, "MinIO Storage (Optional)", "Local S3 emulation running on localhost:9000 (profile: storage-local). Note: Not connected to M01 API")
  }

  Rel(user, web, "Views catalog", "HTTP / 3001")
  Rel(user, api, "Checks health / benchmarks", "HTTP / 3000")
  Rel(web, api, "Fetches /v1/media", "Server-side HTTP / 3000")
  Rel(api, db, "Queries READY media & checks health", "Postgres TCP / 5432")
```

## Architectural Notes (M01 Scope)
1. **Control Plane Only:** M01 delivers metadata catalog and health verification. Binary media upload, transcoding, and HLS playback will be introduced in M04–M05.
2. **Storage Separation:** Object storage (MinIO local or Cloudflare R2 cloud) is defined in infrastructure configuration, but M01 API does not proxy or serve binary media files.
3. **Future Components (Deferred):** Media Worker (FFmpeg), Event Relay, and Analytics Consumer directories exist as structural placeholders (`.gitkeep`) and will be implemented in subsequent milestones.
