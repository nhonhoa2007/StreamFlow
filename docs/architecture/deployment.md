# StreamFlow — C4 Deployment Diagram (M08 Multi-Replica Stage B)

## 1. Stage B Architecture Diagram

```mermaid
C4Deployment
  title Deployment Diagram - StreamFlow Stage B (NGINX + Multi-Replica API)

  Deployment_Node(user_browser, "Client Device", "Desktop or Mobile Browser") {
    Container(spa, "Web Client", "Next.js 15 App Router", "Browser frontend")
  }

  Deployment_Node(stage_b, "Stage B Host Server", "Docker Compose Environment") {
    Deployment_Node(dmz, "Public DMZ") {
      Container(nginx, "NGINX Reverse Proxy", "NGINX 1.25 Alpine", "Terminates HTTP (Port 80/443), round-robin load balancing, keepalive, and passive failover.")
    }

    Deployment_Node(app_tier, "Application Cluster", "Private Docker Network: streamflow-net") {
      Container(api1, "API Replica 1", "NestJS 11 Fastify", "Stateless HTTP API (Port 3000)")
      Container(api2, "API Replica 2", "NestJS 11 Fastify", "Stateless HTTP API (Port 3000)")
      Container(worker, "Media Worker", "Node.js / BullMQ", "Autonomous FFmpeg transcode consumer")
    }

    Deployment_Node(data_tier, "Data Tier") {
      ContainerDb(postgres, "PostgreSQL 16", "Relational Database", "Stores users, media metadata, playlists, refresh sessions, transcode jobs")
      ContainerDb(redis, "Redis 7", "In-Memory Data Store", "Cache-aside catalog storage and BullMQ queue backbone")
      ContainerDb(minio, "MinIO Object Storage", "S3-Compatible Storage", "Stores raw media uploads and HLS rendition artifacts")
    }
  }

  Rel(user_browser, nginx, "Sends HTTP API & Catalog requests", "HTTPS / HTTP / Port 80")
  Rel(nginx, api1, "Balances traffic (Round-Robin + Keepalive)", "HTTP / 3000")
  Rel(nginx, api2, "Balances traffic (Round-Robin + Keepalive)", "HTTP / 3000")
  Rel(api1, postgres, "Queries / Writes state", "TCP 5432")
  Rel(api2, postgres, "Queries / Writes state", "TCP 5432")
  Rel(api1, redis, "Cache-aside & Enqueue BullMQ jobs", "TCP 6379")
  Rel(api2, redis, "Cache-aside & Enqueue BullMQ jobs", "TCP 6379")
  Rel(worker, redis, "Pulls transcode jobs", "TCP 6379")
  Rel(worker, minio, "Reads source uploads & writes HLS segments", "HTTP 9000")
```

## 2. Key Architectural Invariants

1. **Stateless API:** Replicas do not share or store in-memory session or authentication state. All state is externalized to PostgreSQL (`refresh_sessions`) and Redis (`ioredis` cache).
2. **Transparent Failover:** NGINX `proxy_next_upstream` guarantees that an unexpected failure on `api-1` is transparently retried against `api-2` without client-facing errors.
3. **Connection Efficiency:** HTTP/1.1 `keepalive 32` upstream pooling maintains open TCP channels between NGINX and the API replicas, avoiding TCP handshake overhead per request.
