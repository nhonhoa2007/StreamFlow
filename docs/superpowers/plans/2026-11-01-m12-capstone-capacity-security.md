# StreamFlow M12 Capstone — Capacity Planning, Security Hardening, Disaster Recovery & Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the 24-week capstone milestone: establish capacity planning models for 100/1k/10k concurrent streams, document a STRIDE security threat model, deliver a disaster recovery and backup drill, execute experiment 012, document ADR-012, and enrich the README into a premier portfolio artifact.

**Architecture:** Comprehensive mathematical models for egress, CDN caching, and database/queue sizing. STRIDE threat model with automated penetration checks (path traversal, token expiry, signature tampering). Disaster recovery drill with RPO/RTO targets. Full architecture retrospective from Level 1 to Level 4.

**Tech Stack:** Node.js, PostgreSQL, Redis, Kafka, MinIO, NGINX, Docker, Vitest, Markdown, Mermaid.

**Spec:** `docs/superpowers/specs/2026-11-01-m12-capstone-capacity-security-design.md`

## Global Constraints

- Capacity models must compute egress for 100, 1,000, and 10,000 concurrent viewers with exact bandwidth values.
- Security tests must verify path traversal rejection, signature tampering detection, and expired JWT rejection.
- Disaster recovery runbook must specify explicit RTO (<30m) and RPO (<1h) targets with runnable backup/restore steps.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. Capacity model must accurately calculate 10,000 concurrent viewers at 3 Mbps = 30 Gbps egress, with 95% CDN cache hit reducing origin egress to 1.5 Gbps.
2. Security tests must strictly block path traversal attempts (`../`) in object storage operations.
3. Disaster recovery backup drill script must verify database dump creation and test restoration.
4. ADR-012 must synthesize architectural decisions across all 12 milestones.
5. README must feature an executive 3-minute summary and technical 10-minute deep dive.

---

### Task 1: Capacity Planning & Bandwidth Cost Model

**Files:**
- Create: `docs/architecture/capacity-planning-and-cost.md`

- [ ] **Step 1: Implement Capacity Planning & Cost Model**
Write `docs/architecture/capacity-planning-and-cost.md` detailing:
1. 100, 1,000, 10,000 concurrent streaming capacity tables.
2. Origin vs. CDN egress economics (95% cache hit ratio analysis).
3. Cloud pricing comparison (CloudFront, Cloudflare, Fastly, Bare Metal).
4. Sizing formulas for API replicas, PostgreSQL pool, Redis cache, and Kafka retention.

- [ ] **Step 2: Commit**
```bash
git add docs/architecture/capacity-planning-and-cost.md
git commit -m "docs: add capstone capacity planning and bandwidth cost model"
```

---

### Task 2: Security Threat Modeling & Hardening (STRIDE)

**Files:**
- Create: `docs/security/threat-model-and-hardening.md`
- Create: `docs/security/security.test.mjs`

- [ ] **Step 1: Write failing automated security tests**
In `docs/security/security.test.mjs`:
1. Asserts object keys containing `../` or null bytes `\0` are rejected as path traversal.
2. Asserts tampered presigned URLs fail signature validation.
3. Asserts expired JWT tokens are rejected with 401.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test docs/security/security.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement security validation test and STRIDE document**
Write `docs/security/threat-model-and-hardening.md` and complete `security.test.mjs`.

- [ ] **Step 4: Run test to verify success**
Run: `node --test docs/security/security.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add docs/security/
git commit -m "docs: add stride threat model and automated security penetration tests"
```

---

### Task 3: Disaster Recovery Runbook & Backup Drill Script

**Files:**
- Create: `docs/runbooks/disaster-recovery-and-backup.md`
- Create: `scripts/dr-backup-restore-drill.mjs`

- [ ] **Step 1: Implement DR runbook and runnable drill script**
In `docs/runbooks/disaster-recovery-and-backup.md`, define RTO (<30m), RPO (<1h), automated backup procedures, and PITR recovery. In `scripts/dr-backup-restore-drill.mjs`, implement an automated backup export and validation drill.

- [ ] **Step 2: Run drill script to verify execution**
Run: `node scripts/dr-backup-restore-drill.mjs`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add docs/runbooks/disaster-recovery-and-backup.md scripts/dr-backup-restore-drill.mjs
git commit -m "docs: add disaster recovery runbook and backup restore drill script"
```

---

### Task 4: Capstone Experiment 012 Runner & Report

**Files:**
- Create: `scripts/perf/run-capstone-capacity-experiment.mjs`
- Create: `docs/experiments/012-capstone-capacity-and-security.md`

- [ ] **Step 1: Implement Capstone experiment runner**
In `run-capstone-capacity-experiment.mjs`, execute capacity calculations, security checks, and disaster recovery assertions.

- [ ] **Step 2: Run experiment script to verify output**
Run: `node scripts/perf/run-capstone-capacity-experiment.mjs`
Expected: PASS.

- [ ] **Step 3: Write experiment report**
Write `docs/experiments/012-capstone-capacity-and-security.md`.

- [ ] **Step 4: Commit**
```bash
git add scripts/perf/ docs/experiments/
git commit -m "docs: add m12 capstone capacity and security experiment report"
```

---

### Task 5: ADR-012: Capstone Architecture Evolution & Retrospective

**Files:**
- Create: `docs/adr/012-capstone-architecture-evolution.md`

- [ ] **Step 1: Implement ADR-012**
Document full architectural retrospective: Level 1 (Modular Monolith) -> Level 2 (Async Media) -> Level 3 (Distributed Runtime) -> Level 4 (Cloud-Native Operations).

- [ ] **Step 2: Commit**
```bash
git add docs/adr/012-capstone-architecture-evolution.md
git commit -m "docs: add adr-012 synthesizing capstone architecture evolution"
```

---

### Task 6: Portfolio README (3-Min Overview & 10-Min Deep Dive) & Final Acceptance

**Files:**
- Modify: `README.md`
- Modify: `scripts/acceptance.test.mjs`

- [ ] **Step 1: Write failing acceptance test checking M12 deliverables**
In `scripts/acceptance.test.mjs`, assert ADR-012, capacity model, threat model, DR runbook, experiment 012 report, and runner exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update README and acceptance test suite**
Write 3-minute executive summary and 10-minute engineering deep dive in `README.md`. Update `scripts/acceptance.test.mjs`.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
```bash
git add README.md scripts/
git commit -m "docs: finalize capstone documentation, portfolio readme, and acceptance tests"
```
