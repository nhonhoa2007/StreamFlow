# Milestone 12 Specification: Capstone — Capacity Planning, Security Hardening, Disaster Recovery & Portfolio

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M12 (Weeks 23–24)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 12 is the capstone culmination of the 24-week StreamFlow distributed systems curriculum. It synthesizes all previous engineering milestones into a hardened, production-ready system with comprehensive capacity planning, security threat modeling, disaster recovery drills, and portfolio-grade documentation:

1. **Capacity Planning & Bandwidth Cost Model (`docs/architecture/capacity-planning-and-cost.md`):**
   - Quantitative evaluation of system capacity under 100, 1,000, and 10,000 concurrent video streams.
   - Network egress calculations (e.g. 10,000 viewers × 3 Mbps = 30 Gbps raw egress; 95% CDN cache hit ratio reduces origin egress to 1.5 Gbps).
   - Comparative multi-cloud bandwidth cost models (AWS CloudFront vs. Cloudflare Stream vs. Fastly vs. Self-Hosted Origin).
   - Sizing models for API replicas, PostgreSQL connection pools, Redis cache memory, and Kafka retention.
2. **Security Threat Modeling & Hardening (`docs/security/threat-model-and-hardening.md`):**
   - Comprehensive STRIDE threat model: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.
   - Defense-in-depth mitigations: Object storage path traversal prevention (`../` sanitization), cryptographic HMAC signed URLs, Argon2id password hashing, and zero credential leakage in logs.
3. **Disaster Recovery & Database Backup Runbook (`docs/runbooks/disaster-recovery-and-backup.md`):**
   - Precise Service Level Objectives: Recovery Point Objective (RPO < 1 hour) and Recovery Time Objective (RTO < 30 minutes).
   - Automated WAL archiving, daily logical `pg_dump` backups, and step-by-step point-in-time recovery (PITR) procedures.
   - Automated backup and restoration validation script (`scripts/dr-backup-restore-drill.mjs`).
4. **Capstone Experiment 012 & Runner:**
   - `scripts/perf/run-capstone-capacity-experiment.mjs` & `docs/experiments/012-capstone-capacity-and-security.md`:
     - Test A: Capacity model computation across 100, 1,000, and 10,000 concurrent viewers.
     - Test B: Security test suite verifying path traversal rejection, expired token rejection, and signature tamper detection.
     - Test C: Automated database backup creation and test restore verification.
5. **Architecture Decision Record (ADR-012):**
   - `docs/adr/012-capstone-architecture-evolution.md`: Full architectural retrospective detailing evolution through Level 1 (Modular Monolith) -> Level 2 (Async Media) -> Level 3 (Distributed Runtime) -> Level 4 (Cloud-Native Operations).
6. **Portfolio-Grade Repository Documentation (`README.md`):**
   - "3-Minute Overview": Core highlights, architecture summary, and clean-checkout quickstart.
   - "10-Minute Deep Dive": In-depth analysis of distributed transactions (Outbox), singleflight stampede prevention, ABR transcoding ladder, NGINX failover, and observability.

---

## 2. Capacity Model Specifications

| Concurrent Viewers | Avg Bitrate | Gross Egress | CDN Cache Hit (95%) | Origin Egress | Required API Replicas |
|---:|---:|---:|---:|---:|---:|
| **100** | 3.0 Mbps | 300 Mbps | 95% | 15 Mbps | 2 replicas |
| **1,000** | 3.0 Mbps | 3.0 Gbps | 95% | 150 Mbps | 2–4 replicas |
| **10,000** | 3.0 Mbps | 30.0 Gbps | 95% | 1.5 Gbps | 6–10 replicas |

---

## 3. Definition of Done

1. Capacity planning and cost model documented in `docs/architecture/capacity-planning-and-cost.md`.
2. STRIDE threat model and security review documented in `docs/security/threat-model-and-hardening.md`.
3. Disaster recovery and backup runbook documented in `docs/runbooks/disaster-recovery-and-backup.md`.
4. Disaster recovery drill script implemented in `scripts/dr-backup-restore-drill.mjs`.
5. Capstone experiment runner (`scripts/perf/run-capstone-capacity-experiment.mjs`) and report (`docs/experiments/012-capstone-capacity-and-security.md`) created and passing.
6. ADR-012 documented in `docs/adr/012-capstone-architecture-evolution.md`.
7. `README.md` enriched with 3-minute executive summary and 10-minute engineering deep dive.
8. Acceptance tests updated in `scripts/acceptance.test.mjs` (15 tests total) and 100% passing across monorepo.
