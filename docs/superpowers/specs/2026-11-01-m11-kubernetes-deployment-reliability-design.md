# Milestone 11 Specification: Kubernetes, CI/CD & Deployment Reliability

- **Project:** StreamFlow (Advanced Backend & Distributed Systems Engineering Lab)
- **Milestone:** M11 (Weeks 21–22)
- **Date:** 2026-11-01
- **Status:** Approved / Specification Finalized

---

## 1. Executive Summary & Objectives

Milestone 11 transitions StreamFlow to a cloud-native **Kubernetes runtime environment** (suitable for local kind/k3d labs or staging/production clusters). It establishes automated scaling, deployment reliability, and zero-downtime rolling updates:

1. **Declarative Kubernetes Resource Manifests (`infra/kubernetes/`):**
   - **Namespace (`namespace.yaml`):** Isolated `streamflow` namespace.
   - **Configuration (`configmap.yaml`, `secret.yaml`):** Environment configuration and secret references.
   - **API Deployment (`api-deployment.yaml`):**
     - Minimum 2 replicas with anti-affinity.
     - Strict resource requests and limits (`cpu: 250m/1000m`, `memory: 256Mi/512Mi`).
     - Liveness probe on `/health/live` (30s initial delay, 10s period).
     - Readiness probe on `/health/ready` (5s initial delay, 5s period, trips on DB starvation).
     - Non-root security context (`runAsNonRoot: true`, `runAsUser: 1001`).
   - **Workers Deployment (`workers-deployment.yaml`):**
     - Media Worker deployment with CPU-bounded limits.
     - Event Relay and Analytics Consumer deployments with independent scaling profiles.
   - **Service & Ingress (`api-service.yaml`, `ingress.yaml`):**
     - `ClusterIP` exposing API port 80 -> container port 3000.
     - Ingress configuration routing `api.streamflow.internal` via NGINX ingress controller.
   - **Autoscaling & High Availability (`hpa.yaml`, `pdb.yaml`):**
     - Horizontal Pod Autoscaler (`HPA`): Scales from 2 to 10 pods when average CPU exceeds 70%.
     - Pod Disruption Budget (`PDB`): `minAvailable: 1` ensuring node drains and maintenance never drop all active pods.
   - **Kustomize Bundle (`kustomization.yaml`):** Declarative release grouping.
2. **CI/CD Reliability & Validation:**
   - Manifest schema validation test (`infra/kubernetes/k8s.test.mjs`).
   - Migration gate: Database schema migration executes as an idempotent pre-deployment step prior to rolling update.
3. **Automated HPA Scaling & Rolling Update Experiment:**
   - `scripts/perf/run-k8s-scaling-experiment.mjs` & `docs/experiments/011-kubernetes-hpa-and-rolling-updates.md`:
     - Test A: CPU load injection triggering HPA scale-up from 2 to 6 pods.
     - Test B: Zero-downtime rolling update (traffic served continuously during pod rollout).
     - Test C: Readiness probe failure preventing broken v2 pods from receiving client traffic.
4. **Architecture Decision Record (ADR-011):**
   - `docs/adr/011-kubernetes-adoption-tradeoffs.md`: Honest evaluation of operational overhead, control plane costs, and when Kubernetes is (or is not) justified versus Docker Compose / ECS.

---

## 2. Resource Specifications

### 2.1 API Pod Resources & Probes
```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "512Mi"
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### 2.2 Horizontal Pod Autoscaler (HPA)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: streamflow-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: streamflow-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 3. Definition of Done

1. Complete set of Kubernetes manifests created in `infra/kubernetes/` (`namespace`, `configmap`, `secret`, `api-deployment`, `workers-deployment`, `api-service`, `ingress`, `hpa`, `pdb`, `kustomization`).
2. Manifest validation test passing in `infra/kubernetes/k8s.test.mjs`.
3. Experiment runner (`scripts/perf/run-k8s-scaling-experiment.mjs`) simulates HPA scale-up and rolling updates.
4. Experiment report `docs/experiments/011-kubernetes-hpa-and-rolling-updates.md` created.
5. ADR-011 documented in `docs/adr/011-kubernetes-adoption-tradeoffs.md`.
6. Acceptance tests in `scripts/acceptance.test.mjs` updated and 100% passing.
