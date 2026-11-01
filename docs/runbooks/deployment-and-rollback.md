# Runbook: Staging Deployment, Rolling Restart & Rollback Procedures

- **Target:** Stage B (Docker Compose Multi-Replica) & Production Staging
- **Components:** NGINX Reverse Proxy, API Replicas (`api-1`, `api-2`), PostgreSQL, Redis
- **Author:** StreamFlow Core SRE & Architecture Team

---

## 1. Pre-Deployment Verification

Before triggering any deployment to staging or production:
1. Ensure full automated verification passes on clean checkout:
   ```bash
   pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/acceptance.test.mjs
   ```
2. Verify database migration scripts are idempotent and non-destructive:
   ```bash
   pnpm --filter @streamflow/database db:migrate
   ```

---

## 2. Zero-Downtime Rolling Restart Procedure

When deploying updated container images to an active multi-replica cluster behind NGINX:

### Step 2.1: Update & Restart Replica 1
1. Build the updated Docker image:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml build api-1
   ```
2. Stop and recreate `api-1`:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml up -d --no-deps api-1
   ```
   *Note: While `api-1` is stopping, NGINX `proxy_next_upstream` automatically routes all active traffic to `api-2`.*
3. Wait for `api-1` healthcheck to report `healthy`:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml ps api-1
   ```
4. Reload NGINX to refresh upstream socket and IP cache:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml exec nginx nginx -s reload
   ```

### Step 2.2: Update & Restart Replica 2
1. Recreate `api-2`:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml up -d --no-deps api-2
   ```
   *Note: `api-1` is now fully operational and absorbs all traffic while `api-2` restarts.*
2. Wait for `api-2` healthcheck to report `healthy`:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml ps api-2
   ```
3. Reload NGINX to re-enable balanced distribution across both healthy replicas:
   ```bash
   docker compose -f infra/compose/compose.stage-b.yaml exec nginx nginx -s reload
   ```

---

## 3. Post-Deployment Smoke Verification

Run the acceptance smoke test suite against the NGINX gateway endpoint (`http://localhost/`):
```bash
curl -f http://localhost/health/ready
curl -f http://localhost/v1/media?limit=10
```

---

## 4. Emergency Rollback Runbook

If elevated error rates, database locking issues, or regression bugs are detected post-deployment:

### Step 4.1: Identify Previous Known-Good Image or Commit
Identify previous stable git commit SHA or tagged container image:
```bash
git log --oneline -n 5
PREV_STABLE_SHA=<last-known-good-commit>
```

### Step 4.2: Revert Code to Stable State
```bash
git checkout $PREV_STABLE_SHA
```

### Step 4.3: Fast Re-deploy of Previous Images
```bash
docker compose -f infra/compose/compose.stage-b.yaml build api-1 api-2
docker compose -f infra/compose/compose.stage-b.yaml up -d --no-deps api-1
# Wait until api-1 healthy, then:
docker compose -f infra/compose/compose.stage-b.yaml up -d --no-deps api-2
```

### Step 4.4: Verify Rollback Success
```bash
curl -s http://localhost/health/ready | grep "ok"
```
Record incident in `docs/postmortems/`.
