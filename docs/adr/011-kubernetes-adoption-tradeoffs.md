# ADR-011: Kubernetes Adoption Tradeoffs & Runtime Topology

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** StreamFlow Core Architecture Team

---

## Context

StreamFlow has progressed through four architectural maturity levels:
1. **Level 1 (Weeks 1–8):** Modular Monolith with Fastify, PostgreSQL, and basic caching.
2. **Level 2 (Weeks 9–14):** Decoupled async media pipelines (FFmpeg, BullMQ, Redis stampede defense).
3. **Level 3 (Weeks 15–20):** Distributed runtime (multi-replica NGINX, Kafka transactional outbox, observability).
4. **Level 4 (Weeks 21–24):** Cloud-Native Operations & Capacity Planning.

At Level 4, teams often default to adopting Kubernetes (K8s) without evaluating whether the operational complexity and financial overhead are justified. We must establish a clear, sober engineering position on where Kubernetes fits within StreamFlow's lifecycle versus Docker Compose or AWS ECS/Fargate.

---

## Decision

We decide to adopt **Kubernetes as a Stage D Cloud-Native Runtime Target**, while deliberately retaining **Docker Compose as the canonical Developer Experience (DX) and Stage B staging runtime**:

1. **Dual-Target Strategy:**
   - **Local Development & Stage B:** Docker Compose (`infra/compose/compose.stage-b.yaml`) remains the primary, fast, low-overhead environment. Engineers can spin up PostgreSQL, Redis, Kafka, MinIO, NGINX, and 2 API replicas in seconds on a single laptop or low-cost VPS.
   - **Stage D Production Lab:** Kubernetes manifests (`infra/kubernetes/`) provide declarative definitions for clusters running on K3s, kind, or managed cloud Kubernetes (EKS/GKE).
2. **Kustomize Over Helm for Core Workloads:**
   - Manifests are organized via native Kustomize (`infra/kubernetes/kustomization.yaml`), avoiding template syntax sprawl while allowing environment-specific overlays (dev vs. prod).
3. **Automated Elasticity & High Availability:**
   - **Horizontal Pod Autoscaling (HPA):** Auto-scales API pods from 2 to 10 based on CPU thresholds (70%), absorbing viewer traffic surges.
   - **Pod Disruption Budgets (PDB):** Enforces `minAvailable: 1` during node upgrades or drains.
   - **Zero-Downtime Rolling Updates:** Enforces `maxSurge: 1, maxUnavailable: 0` paired with HTTP `/health/live` and `/health/ready` probes.
4. **Stateful vs. Stateless Boundary:**
   - Compute workloads (API, Media Worker, Event Relay, Analytics Consumer) run as Kubernetes Deployments.
   - Core persistent storage (PostgreSQL and Object Storage) should ideally remain on managed cloud services (RDS, S3/R2) in production, avoiding complex distributed storage operators (Ceph/Rook) unless strictly necessary.

---

## When Kubernetes is Justified for StreamFlow

- **Dynamic, Spiky Traffic:** When concurrent viewer demand fluctuates dramatically (e.g. popular video releases), HPA scales API pods horizontally and worker pods process backlogs without manual intervention.
- **Multi-Node Cluster Resilience:** When workload memory exceeds a single server's capacity, K8s schedules pods across failure domains.
- **Zero-Downtime Blue/Green or Canary Deployments:** Native rolling updates eliminate custom shell scripts and manual proxy reloads.

---

## When Kubernetes is an Anti-Pattern

- **Single-Server Workloads (<1,000 Concurrent Users):** A $40/month dedicated server running Docker Compose handles thousands of requests per second with negligible complexity. Running K8s on a single node wastes 20–30% of system memory on control-plane daemons (`kube-apiserver`, `etcd`, `kubelet`, CNI).
- **Small Engineering Teams:** Managing K8s ingress certificates, CNI plugins, RBAC, and storage classes requires dedicated SRE bandwidth that distracts from core product engineering.

---

## Consequences

### Positive
- **Declarative Infrastructure:** Full cluster topology is version-controlled and auditable.
- **Automated Self-Healing:** Failed pods are automatically restarted; unready pods are instantly removed from Service endpoints.
- **Elastic Scale:** Automated resource governance prevents CPU starvation during heavy video transcode waves.

### Negative / Tradeoffs
- **Cognitive Overhead:** Developers must understand Kubernetes abstractions (Services, Ingress, Pods, Endpoints, Labels).
- **Resource Tax:** Local kind/k3d development clusters consume significantly more RAM and CPU than raw Docker Compose.
