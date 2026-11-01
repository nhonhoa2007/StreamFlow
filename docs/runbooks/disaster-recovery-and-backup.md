# Runbook: Database Disaster Recovery, Backup & Restoration Playbook

- **Target Systems:** PostgreSQL Primary Cluster, MinIO/S3 Media Storage, Redis State
- **Target Objectives:** RPO < 1 Hour | RTO < 30 Minutes
- **Author:** StreamFlow SRE & Data Reliability Team
- **Status:** Active / Production Ready

---

## 1. Service Level Objectives (SLOs)

- **Recovery Point Objective (RPO):** Maximum allowable data loss is **1 hour**.
  - *Mechanism:* Continuous WAL (Write-Ahead Log) archiving paired with automated hourly logical dumps.
- **Recovery Time Objective (RTO):** Service restoration within **30 minutes** of incident declaration.
  - *Mechanism:* Pre-scripted automated restoration container images and containerized backup loaders.

---

## 2. Automated Backup Architecture

### 2.1 Daily Full Logical Backups
Executed every midnight UTC via cron or Kubernetes CronJob:
```bash
pg_dump -h $PGHOST -U postgres -d streamflow -F c -b -v -f /backups/streamflow_$(date +%Y%m%d_%H%M%S).dump
```

### 2.2 Continuous Write-Ahead Log (WAL) Archiving
PostgreSQL configured with `wal_level = replica` and `archive_mode = on`:
```ini
archive_command = 'test ! -f /wal_archives/%f && cp %p /wal_archives/%f'
archive_timeout = 300 # Flush WAL segment every 5 minutes
```

### 2.3 Off-Site Redundancy
All backup dumps and WAL segments are encrypted via AES-256 and synchronized to a secondary geographical cloud region (e.g. Cloudflare R2 or AWS S3 Glacier).

---

## 3. Step-by-Step Restoration Playbooks

### 3.1 Playbook A: Point-in-Time Recovery (PITR) for Accidental Data Loss
Use case: An accidental `DROP TABLE` or corrupt batch operation occurred at 14:32 UTC.

1. Stop application traffic to prevent further mutations:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml stop api-1 api-2
   ```
2. Restore the latest full backup prior to the incident:
   ```bash
   pg_restore -h $PGHOST -U postgres -d streamflow --clean /backups/latest_clean.dump
   ```
3. Create `recovery.signal` and configure target recovery time in `postgresql.conf`:
   ```ini
   recovery_target_time = '2026-11-01 14:30:00 UTC'
   restore_command = 'cp /wal_archives/%f %p'
   ```
4. Start PostgreSQL and verify recovery targets:
   ```sql
   SELECT pg_is_in_recovery(), pg_last_xact_replay_timestamp();
   ```
5. Resume application traffic.

---

### 3.2 Playbook B: Total Datacenter / Hardware Failure
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
3. Fetch latest off-site snapshot and restore:
   ```bash
   pg_restore -h 127.0.0.1 -U postgres -d streamflow /backups/latest_offsite.dump
   ```
4. Run migrations to verify schema parity:
   ```bash
   pnpm --filter @streamflow/database db:migrate
   ```
5. Start full service stack:
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
   - Checksum matching (100% byte fidelity).
   - RTO under 30 minutes.
   - RPO under 1 hour.
3. Record drill results in `docs/postmortems/`.
