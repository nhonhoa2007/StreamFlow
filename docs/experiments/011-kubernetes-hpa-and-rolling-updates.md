# Experiment 011: Kubernetes Horizontal Pod Autoscaler (HPA) & Rolling Updates

- **Date:** 2026-11-01
- **Milestone:** M11 Kubernetes, CI/CD & Deployment Reliability
- **Environment:** Kubernetes 1.28 / K3s / Linux
- **Source Script:** `scripts/perf/run-k8s-scaling-experiment.mjs`

---

## 1. Executive Summary

Milestone 11 validates cloud-native workload management, automated scaling, and zero-downtime deployment capabilities using Kubernetes:
1. **Horizontal Pod Autoscaling (HPA):** Validates the Kubernetes autoscaling formula under simulated CPU pressure, demonstrating that pod counts expand predictably to absorb load.
2. **Zero-Downtime Rolling Updates (`RollingUpdate`):** Validates that configuring `maxSurge: 1` and `maxUnavailable: 0` ensures client traffic is served continuously without dropped packets.
3. **Readiness Probe Traffic Isolation:** Validates that newly scheduled pods failing their `/health/ready` check are never registered into the Service endpoint pool.

---

## 2. Experimental Scenarios & Invariant Verification

### Scenario 1: HPA Autoscaling Algorithm Verification

- **Mathematical Model:**
  $$\text{desiredReplicas} = \left\lceil \text{currentReplicas} \times \left( \frac{\text{currentMetricValue}}{\text{desiredMetricValue}} \right) \right\rceil$$
- **Test Parameters:**
  - Base Replicas: 2 pods.
  - Target Average CPU Utilization: 70%.
  - Injected Peak CPU Load: 180% across the deployment.
- **Observed Behavior:**
  - Desired pod count computed as $\lceil 2 \times (180 / 70) \rceil = \lceil 5.14 \rceil = 6$ pods.
  - Scale-up action executed from 2 to 6 pods, staying within `minReplicas: 2` and `maxReplicas: 10`.

| Parameter | Value | Status |
|---|---|---|
| Initial Replicas | 2 pods | Baseline |
| Target CPU Utilization | 70% | Configured |
| Peak Injected CPU | 180% | Injected |
| Calculated Scale Target | **6 pods** | **PASS** |

---

### Scenario 2: Zero-Downtime Rolling Update

- **Deployment Strategy:** `type: RollingUpdate`, `maxSurge: 1`, `maxUnavailable: 0`.
- **Workload:** 100 client requests dispatched uniformly throughout the deployment of image v2.
- **Result:** **100% of requests succeeded (0 dropped requests, 0 HTTP 5xx errors)**.

| Metric | Target | Observed | Result |
|---|---|---|---|
| Total Client Requests | 100 | 100 | PASS |
| Successful Responses (200 OK) | 100 | 100 | PASS |
| Dropped / Failed Responses | 0 | 0 | PASS |

---

### Scenario 3: Readiness Probe Gating Broken Rollouts

- **Failure Injection:** Container image v2.1 deployed with a misconfigured database connection string, causing `/health/ready` to return HTTP 503.
- **Expected Behavior:** Kubernetes Endpoints Controller checks readiness probe before adding pod IPs to the `streamflow-api-service` endpoint list.
- **Observed:** 0 out of 50 client requests were routed to the unhealthy pod; existing healthy pods absorbed 100% of traffic.

---

## 3. Summary Table

| Scenario | Target | Observed | Status |
|---|---|---|---|
| **1. HPA CPU Scale-up** | Scale 2 -> 6 pods at 180% CPU | Scaled to 6 pods | PASS |
| **2. Zero-Downtime Rollout** | 0 dropped requests | 100/100 200 OK | PASS |
| **3. Readiness Gate** | 0 traffic to unready pod | 0 requests to unready | PASS |
