# StreamFlow M11 Kubernetes, CI/CD & Deployment Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish declarative cloud-native Kubernetes deployment manifests for StreamFlow, configure Horizontal Pod Autoscaling (HPA) and Pod Disruption Budgets (PDB), validate rolling updates with zero downtime, and evaluate Kubernetes adoption tradeoffs in ADR-011.

**Architecture:** A containerized Kubernetes environment where the Fastify API runs as a 2-to-10 replica Deployment with liveness and readiness probes, autoscale metrics, and non-root security contexts. Worker processes run as dedicated Deployments. Traffic enters via an Ingress routing to a ClusterIP service. Kustomize bundles all resources.

**Tech Stack:** Kubernetes (v1.28+), Kustomize, HPA v2, Ingress NGINX, Docker, Node.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-m11-kubernetes-deployment-reliability-design.md`

## Global Constraints

- Manifests must follow standard Kubernetes API versioning (`apps/v1`, `autoscaling/v2`, `networking.k8s.io/v1`).
- All workload pods must define explicit CPU and memory resource requests and limits.
- API pods must define HTTP liveness and readiness probes pointing to `/health/live` and `/health/ready`.
- Secrets must never store unencrypted plaintext production secrets directly in git.
- Commits use Conventional Commits in English, single concise subject line, no body, no AI attribution trailers.

## Review Focus

1. API deployment manifests must specify non-root securityContext (`runAsNonRoot: true`, `runAsUser: 1001`).
2. Readiness probe failure must prevent a newly deployed pod from receiving client traffic during rolling updates.
3. HPA configuration must target 70% average CPU utilization with minReplicas 2 and maxReplicas 10.
4. Pod Disruption Budget (PDB) must guarantee minAvailable 1 pod during cluster drains or upgrades.
5. Ingress manifest must correctly route incoming paths and declare appropriate ingressClassName (`nginx`).

---

### Task 1: Core Kubernetes Manifests (Namespace, ConfigMap, Secret & Service)

**Files:**
- Create: `infra/kubernetes/namespace.yaml`
- Create: `infra/kubernetes/configmap.yaml`
- Create: `infra/kubernetes/secret.yaml`
- Create: `infra/kubernetes/api-service.yaml`
- Create: `infra/kubernetes/k8s.test.mjs`

- [ ] **Step 1: Write failing test verifying core manifests**
In `infra/kubernetes/k8s.test.mjs`, parse YAML and assert `namespace.yaml`, `configmap.yaml`, `secret.yaml`, and `api-service.yaml` contain correct `apiVersion`, `kind`, and `metadata.namespace`.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test infra/kubernetes/k8s.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement core manifests**
Write `namespace.yaml`, `configmap.yaml`, `secret.yaml`, and `api-service.yaml`.

- [ ] **Step 4: Run test to verify success**
Run: `node --test infra/kubernetes/k8s.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add infra/kubernetes/
git commit -m "feat(k8s): add namespace, configmap, secret, and api service manifests"
```

---

### Task 2: API & Worker Deployments (Probes, Resources & SecurityContext)

**Files:**
- Create: `infra/kubernetes/api-deployment.yaml`
- Create: `infra/kubernetes/workers-deployment.yaml`
- Modify: `infra/kubernetes/k8s.test.mjs`

- [ ] **Step 1: Write failing test verifying Deployment manifests**
In `infra/kubernetes/k8s.test.mjs`, assert `api-deployment.yaml` contains `replicas: 2`, `livenessProbe`, `readinessProbe`, `runAsNonRoot: true`, and resource limits; assert `workers-deployment.yaml` defines media worker, event relay, and analytics consumer containers.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test infra/kubernetes/k8s.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement API and worker deployment manifests**
Write `api-deployment.yaml` and `workers-deployment.yaml`.

- [ ] **Step 4: Run test to verify success**
Run: `node --test infra/kubernetes/k8s.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add infra/kubernetes/
git commit -m "feat(k8s): add api and background worker deployment manifests"
```

---

### Task 3: Ingress, HPA, PDB & Kustomization Bundle

**Files:**
- Create: `infra/kubernetes/ingress.yaml`
- Create: `infra/kubernetes/hpa.yaml`
- Create: `infra/kubernetes/pdb.yaml`
- Create: `infra/kubernetes/kustomization.yaml`
- Modify: `infra/kubernetes/k8s.test.mjs`

- [ ] **Step 1: Write failing test verifying Ingress, HPA, PDB, and Kustomization**
In `infra/kubernetes/k8s.test.mjs`, assert `ingress.yaml` routes `/` to `streamflow-api-service:80`, `hpa.yaml` targets 70% CPU (min 2, max 10), `pdb.yaml` sets `minAvailable: 1`, and `kustomization.yaml` references all files.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test infra/kubernetes/k8s.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement Ingress, HPA, PDB, and Kustomization**
Write `ingress.yaml`, `hpa.yaml`, `pdb.yaml`, and `kustomization.yaml`.

- [ ] **Step 4: Run test to verify success**
Run: `node --test infra/kubernetes/k8s.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add infra/kubernetes/
git commit -m "feat(k8s): add ingress, hpa, pdb, and kustomization manifests"
```

---

### Task 4: HPA & Rolling Update Experiment Runner & Report

**Files:**
- Create: `scripts/perf/run-k8s-scaling-experiment.mjs`
- Create: `docs/experiments/011-kubernetes-hpa-and-rolling-updates.md`

- [ ] **Step 1: Write HPA scaling and rolling update simulation runner**
In `run-k8s-scaling-experiment.mjs`:
Simulate HPA CPU-based autoscaling calculation from 2 to 6 replicas, rolling update traffic continuity, and readiness probe blocking unhealthy pods.

- [ ] **Step 2: Run experiment script to verify output**
Run: `node scripts/perf/run-k8s-scaling-experiment.mjs`
Expected: PASS.

- [ ] **Step 3: Write experiment report**
Write `docs/experiments/011-kubernetes-hpa-and-rolling-updates.md` documenting HPA scaling curves, rolling deployment zero-downtime evidence, and readiness gating.

- [ ] **Step 4: Commit**
```bash
git add scripts/perf/ docs/experiments/
git commit -m "docs: add m11 k8s autoscaling experiment runner and report"
```

---

### Task 5: ADR-011: Kubernetes Adoption Tradeoffs

**Files:**
- Create: `docs/adr/011-kubernetes-adoption-tradeoffs.md`

- [ ] **Step 1: Implement ADR-011**
Document Context, Decision, and Consequences analyzing operational complexity, control plane overhead, and when K8s is justified vs Docker Compose / ECS.

- [ ] **Step 2: Commit**
```bash
git add docs/adr/011-kubernetes-adoption-tradeoffs.md
git commit -m "docs: add adr-011 analyzing kubernetes adoption tradeoffs"
```

---

### Task 6: Acceptance Tests & Monorepo Layout Verification

**Files:**
- Modify: `scripts/acceptance.test.mjs`
- Modify: `scripts/check-layout.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing acceptance test checking M11 deliverables**
In `scripts/acceptance.test.mjs`, assert ADR-011, experiment 011 report, runner, and K8s manifests exist.

- [ ] **Step 2: Run test to verify failure**
Run: `node --test scripts/acceptance.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update acceptance tests, layout check, and README**
Update `scripts/acceptance.test.mjs`, remove `infra/kubernetes` from `scripts/check-layout.test.mjs`, and update `README.md`.

- [ ] **Step 4: Run full verification suite**
Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build && node --test scripts/check-layout.test.mjs && node --test scripts/acceptance.test.mjs`
Expected: All pass 100%.

- [ ] **Step 5: Commit**
```bash
git add scripts/ README.md
git commit -m "docs: add m11 acceptance tests and update repository roadmap documentation"
```
