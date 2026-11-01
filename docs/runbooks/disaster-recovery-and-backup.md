# Runbook: Database Disaster Recovery, Backup & Restoration Playbook

- **Target Systems:** PostgreSQL Primary Cluster, MinIO/S3 Media Storage, Redis State
- **Target Objectives:** RPO < 1 Hour | RTO < 30 Minutes
- **Author:** StreamFlow SRE & Data Reliability Team
- **Status:** Active / Production Ready

---

## 1. Service Level Objectives (SLOs)

- **Recovery Point Objective (RPO):** Maximum allowable data loss is **1 hour**.
  - *Mechanism:* Continuous WAL (Write-Ahead Log) archiving paired with automated daily logical dumps.
- **Recovery Time Objective (RTO):** Service restoration within **30 minutes** of incident declaration.
  - *Mechanism:* Automated Docker/Kubernetes containerized restoration procedures and scripted verification drills.

---

## 2. Automated Backup Architecture

### 2.1 Daily Full Logical Backups
Executed every midnight UTC via scheduled cron or Kubernetes CronJob inside the database container:
```bash
docker compose -f infra/compose/compose.stage-b.yaml exec -T postgres \
  pg_dump -U postgres -d streamflow -F c -b -v -f /var/lib/postgresql/data/backups/streamflow_$(date +%Y%m%d_%H%M%S).dump
```

### 2.2 Continuous Write-Ahead Log (WAL) Archiving
PostgreSQL configured with `wal_level = replica` and `archive_mode = on`:
```ini
archive_command = 'test ! -f /wal_archives/%f && cp %p /wal_archives/%f'
archive_timeout = 300 # Flush WAL segment every 5 minutes
```

### 2.3 Media Object Storage Disaster Recovery
Video source files, HLS rendition playlists, segments (`.ts`), and thumbnails stored in MinIO/S3 are synchronized to an off-site disaster recovery bucket every 30 minutes:
```bash
docker compose -f infra/compose/compose.stage-b.yaml exec -T createbuckets \
  mc mirror --overwrite local/streamflow-media-dev remote-dr/streamflow-media-backup
```

### 2.4 Off-Site Redundancy
All database backup dumps and WAL segments are encrypted via AES-256 and synchronized to a secondary geographical cloud region (e.g. Cloudflare R2 or AWS S3 Glacier).

---

## 3. Step-by-Step Restoration Playbooks

### 3.1 Playbook A: Point-in-Time Recovery (PITR) for Accidental Data Loss
Use case: An accidental `DROP TABLE` or corrupt batch operation occurred at 14:32 UTC.

1. Stop application traffic to prevent further mutations:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml stop api-1 api-2 media-worker event-relay analytics-consumer
   ```
2. Restore the latest physical base backup (`pg_basebackup`) into a clean database data directory.
3. Configure `recovery.signal` and `postgresql.conf` parameters:
   ```ini
   recovery_target_time = '2026-11-01 14:30:00 UTC'
   restore_command = 'cp /wal_archives/%f %p'
   recovery_target_action = 'promote'
   ```
4. Start PostgreSQL and verify recovery replay:
   ```sql
   SELECT pg_is_in_recovery(), pg_last_xact_replay_timestamp();
   ```
5. Resume application traffic once recovery completes and database promotes to read-write.

---

### 3.2 Playbook B: Total Hardware Failure (Restore from Logical Dump)
Use case: Primary host server unrecoverable; spin up replacement cluster from clean state.

1. Provision replacement instance and clone repository:
   ```bash
   git clone https://github.com/streamflow/streamflow.git
   cd streamflow
   ```
2. Initialize fresh database container:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml up -d postgres
   ```
3. Copy latest off-site snapshot and restore inside container:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml exec -T postgres \
     pg_restore -U postgres -d streamflow --clean /var/lib/postgresql/data/backups/latest_offsite.dump
   ```
4. Synchronize media assets from DR object storage:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml exec -T createbuckets \
     mc mirror --overwrite remote-dr/streamflow-media-backup local/streamflow-media-dev
   ```
5. Run migrations to verify schema parity:
   ```bash
   pnpm --filter @streamflow/database db:migrate
   ```
6. Start full service stack:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml up -d
   ```

---

## 4. Periodic DR Drill Checklist

Every quarter, the engineering team executes the automated disaster recovery drill:
1. Run drill simulation:
   ```bash
   node scripts/dr-backup-restore-drill.mjs
   ```
2. Verify all 3 metrics pass:
   - Checksum matching (100% byte fidelity in PostgreSQL).
   - RTO under 30 minutes.
   - RPO under 1 hour.
3. Record drill results in `docs/postmortems/`.
