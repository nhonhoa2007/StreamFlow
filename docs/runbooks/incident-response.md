# Runbook: On-Call Incident Response & Golden Signals Triage

- **Scope:** StreamFlow API, Media Worker, Event Relay, Analytics Consumer, PostgreSQL, Redis, Kafka
- **Target Audience:** On-Call SREs and Backend Engineers
- **Status:** Active / Production Ready

---

## 1. Incident Severity Matrix

| Severity | Definition | Target Response | Escalation Channel |
|---|---|---|---|
| **SEV-1** | Total system outage, data loss risk, or core playback/auth failure for >10% of users | Immediate (<15m) | Page Engineering Lead & Incident Commander |
| **SEV-2** | Degraded user experience (p95 > 1s, upload delays > 15m, single replica crash) | <30 minutes | Slack `#incident-war-room` |
| **SEV-3** | Non-urgent background backlog, cache fail-open degradation, or single worker crash with auto-recovery | <2 hours | Slack `#streamflow-alerts` |

---

## 2. Initial Golden Signals Triage Flow

Upon receiving an alert:
1. **Check System Health:**
   ```bash
   curl -I http://localhost:80/health/ready
   curl -I http://localhost:80/health/live
   ```
2. **Inspect Golden Signals on Grafana (`streamflow-overview`):**
   - **Rate:** Has traffic spiked abnormally (possible DDoS or thundering herd)?
   - **Errors:** Are 5xx error percentages exceeding 1%?
   - **Duration:** Is p95 latency > 500ms?
   - **Saturation:** Are database active connections > 85% or CPU > 80%?

---

## 3. Playbooks by Component Failure

### 3.1 Playbook A: Elevated API 5xx Errors / High Latency
1. Check NGINX error logs:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml logs --tail=100 nginx
   ```
2. Identify failing upstream (`api-1` or `api-2`):
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml ps
   ```
3. Restart degraded replica:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml restart api-1
   ```

### 3.2 Playbook B: Database Pool Saturation (`DatabasePoolSaturation`)
1. Connect to PostgreSQL and query active connections:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC;
   ```
2. Cancel or terminate long-running queries (>10s):
   ```sql
   SELECT pg_cancel_backend(pid);
   -- If unresponsive:
   SELECT pg_terminate_backend(pid);
   ```

### 3.3 Playbook C: Redis Cache Outage / High DB Load
1. Note: The API automatically operates in fail-open mode, querying PostgreSQL directly.
2. Verify Redis container status:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml logs --tail=50 redis
   docker compose -f infra/compose/compose.stage-b.yaml restart redis
   ```

### 3.4 Playbook D: Transcode Queue Backlog (`QueueLagHigh`)
1. Check worker logs for unhandled errors or stuck jobs:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml logs --tail=100 media-worker
   ```
2. Restart or scale worker capacity if upload volume surged:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml restart media-worker
   ```

---

## 4. Post-Incident Process

For any SEV-1 or SEV-2 incident:
1. Conduct a blameless postmortem meeting within 48 hours.
2. Document incident in `docs/postmortems/` using the standard format:
   - Summary, Timeline, Impact, Root Cause, Trigger, Detection, and Corrective Action Items.
