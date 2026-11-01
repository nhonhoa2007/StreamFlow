import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("Kubernetes core manifests exist and define valid schema and namespace", () => {
  const nsPath = path.resolve("infra/kubernetes/namespace.yaml");
  const cmPath = path.resolve("infra/kubernetes/configmap.yaml");
  const secretPath = path.resolve("infra/kubernetes/secret.yaml");
  const svcPath = path.resolve("infra/kubernetes/api-service.yaml");

  assert.ok(fs.existsSync(nsPath), "namespace.yaml must exist");
  assert.ok(fs.existsSync(cmPath), "configmap.yaml must exist");
  assert.ok(fs.existsSync(secretPath), "secret.yaml must exist");
  assert.ok(fs.existsSync(svcPath), "api-service.yaml must exist");

  // 1. Namespace
  const nsContent = fs.readFileSync(nsPath, "utf-8");
  assert.match(nsContent, /kind:\s*Namespace/);
  assert.match(nsContent, /name:\s*streamflow/);

  // 2. ConfigMap
  const cmContent = fs.readFileSync(cmPath, "utf-8");
  assert.match(cmContent, /kind:\s*ConfigMap/);
  assert.match(cmContent, /namespace:\s*streamflow/);
  assert.match(cmContent, /NODE_ENV:\s*["']?production["']?/);
  assert.match(cmContent, /PORT:\s*["']?3000["']?/);

  // 3. Secret
  const secretContent = fs.readFileSync(secretPath, "utf-8");
  assert.match(secretContent, /kind:\s*Secret/);
  assert.match(secretContent, /namespace:\s*streamflow/);

  // 4. API Service
  const svcContent = fs.readFileSync(svcPath, "utf-8");
  assert.match(svcContent, /kind:\s*Service/);
  assert.match(svcContent, /namespace:\s*streamflow/);
  assert.match(svcContent, /type:\s*ClusterIP/);
  assert.match(svcContent, /port:\s*80/);
  assert.match(svcContent, /targetPort:\s*3000/);
});

test("Kubernetes workload deployments define probes, resources, and security context", () => {
  const apiDepPath = path.resolve("infra/kubernetes/api-deployment.yaml");
  const workersDepPath = path.resolve("infra/kubernetes/workers-deployment.yaml");

  assert.ok(fs.existsSync(apiDepPath), "api-deployment.yaml must exist");
  assert.ok(fs.existsSync(workersDepPath), "workers-deployment.yaml must exist");

  const apiContent = fs.readFileSync(apiDepPath, "utf-8");
  assert.match(apiContent, /kind:\s*Deployment/);
  assert.match(apiContent, /replicas:\s*2/);
  assert.match(apiContent, /runAsNonRoot:\s*true/);
  assert.match(apiContent, /runAsUser:\s*1001/);
  assert.match(apiContent, /podAntiAffinity:/);
  assert.match(apiContent, /livenessProbe:/);
  assert.match(apiContent, /readinessProbe:/);
  assert.match(apiContent, /resources:/);
  assert.match(apiContent, /limits:/);
  assert.match(apiContent, /requests:/);

  const workersContent = fs.readFileSync(workersDepPath, "utf-8");
  assert.match(workersContent, /kind:\s*Deployment/);
  assert.match(workersContent, /name:\s*streamflow-media-worker/);
  assert.match(workersContent, /name:\s*streamflow-event-relay/);
  assert.match(workersContent, /name:\s*streamflow-analytics-consumer/);
});

test("Kubernetes ingress, autoscaling, disruption budget, and kustomize bundle exist", () => {
  const ingressPath = path.resolve("infra/kubernetes/ingress.yaml");
  const hpaPath = path.resolve("infra/kubernetes/hpa.yaml");
  const pdbPath = path.resolve("infra/kubernetes/pdb.yaml");
  const kustomizePath = path.resolve("infra/kubernetes/kustomization.yaml");
  const migrationJobPath = path.resolve("infra/kubernetes/migration-job.yaml");

  assert.ok(fs.existsSync(ingressPath), "ingress.yaml must exist");
  assert.ok(fs.existsSync(hpaPath), "hpa.yaml must exist");
  assert.ok(fs.existsSync(pdbPath), "pdb.yaml must exist");
  assert.ok(fs.existsSync(kustomizePath), "kustomization.yaml must exist");
  assert.ok(fs.existsSync(migrationJobPath), "migration-job.yaml must exist");

  const ingressContent = fs.readFileSync(ingressPath, "utf-8");
  assert.match(ingressContent, /kind:\s*Ingress/);
  assert.match(ingressContent, /ingressClassName:\s*["']?nginx["']?/);
  assert.match(ingressContent, /tls:/);
  assert.match(ingressContent, /streamflow-api-service/);
  assert.match(ingressContent, /number:\s*80/);

  const hpaContent = fs.readFileSync(hpaPath, "utf-8");
  assert.match(hpaContent, /kind:\s*HorizontalPodAutoscaler/);
  assert.match(hpaContent, /minReplicas:\s*2/);
  assert.match(hpaContent, /maxReplicas:\s*10/);
  assert.match(hpaContent, /averageUtilization:\s*70/);

  const pdbContent = fs.readFileSync(pdbPath, "utf-8");
  assert.match(pdbContent, /kind:\s*PodDisruptionBudget/);
  assert.match(pdbContent, /minAvailable:\s*1/);

  const kustomizeContent = fs.readFileSync(kustomizePath, "utf-8");
  assert.match(kustomizeContent, /namespace\.yaml/);
  assert.match(kustomizeContent, /migration-job\.yaml/);
  assert.match(kustomizeContent, /api-deployment\.yaml/);
  assert.match(kustomizeContent, /hpa\.yaml/);
});
