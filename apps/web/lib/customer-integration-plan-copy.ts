import {
  buildCustomerIntegrationPlan,
  GO_LIVE_ACCEPTANCE_ITEMS,
  type CustomerIntegrationPlan,
} from "@/lib/customer-integration-plan";
import type { CapacityPlannerInput } from "@/lib/customer-capacity-planner";

function section(title: string, lines: string[]): string {
  return [title, ...lines.map((l) => (l.startsWith("-") || l.startsWith("•") ? l : `• ${l}`))].join("\n");
}

export function buildIntegrationPlanPlainText(
  plan: CustomerIntegrationPlan,
  input: CapacityPlannerInput
): string {
  const parts = [
    plan.title,
    "=".repeat(plan.title.length),
    "",
    "Summary",
    plan.summary,
    "",
    section("Recommended architecture", plan.recommendedArchitecture),
    "",
    "Endpoint split",
    ...plan.endpointSplit.map(
      (r) => `• ${r.workload}: ${r.endpoint}\n  When: ${r.whenToUse}`
    ),
    "",
    "Model plan",
    ...plan.modelPlan.map((r) => `• ${r.scenario}: ${r.model} — ${r.reason}`),
    "",
    "Concurrency plan",
    `• Chat: ${plan.concurrencyPlan.chatConcurrency}`,
    `• Image: ${plan.concurrencyPlan.imageConcurrency}`,
    `• Batch items/job: ${plan.concurrencyPlan.batchItemsPerJob}`,
    `• Batch poll interval: ${plan.concurrencyPlan.batchPollIntervalSeconds}s (max 60 polls)`,
    "",
    "Retry / backoff",
    ...plan.retryPlan.map((r) => `• ${r.error}: ${r.action}`),
    "",
    section("API Key security", plan.securityNotes),
    "",
    section("Usage / Credits reconciliation", plan.reconciliationSteps),
    "",
    section("Rollout steps", plan.rolloutSteps),
    "",
    section("Go-live acceptance", plan.acceptanceChecklist),
    "",
    plan.boundaryNote ? `Boundary: ${plan.boundaryNote}` : "",
    "",
    "Share with: " + plan.copyTargets.join("; "),
    "",
    `Industry: ${input.industry} | Online users: ${input.onlineUsers} | Workload: ${input.trafficShape}`,
    "Customize inputs in Dashboard → Capacity planner for your exact traffic.",
  ];
  return parts.filter(Boolean).join("\n");
}

export function buildIntegrationPlanMarkdown(
  plan: CustomerIntegrationPlan,
  input: CapacityPlannerInput
): string {
  const lines = [
    `# ${plan.title}`,
    "",
    plan.summary,
    "",
    "## Recommended architecture",
    ...plan.recommendedArchitecture.map((l) => `- ${l}`),
    "",
    "## Endpoint split",
    "| Workload | Endpoint | When to use |",
    "| --- | --- | --- |",
    ...plan.endpointSplit.map(
      (r) => `| ${r.workload} | ${r.endpoint} | ${r.whenToUse} |`
    ),
    "",
    "## Model plan",
    "| Scenario | Model | Reason |",
    "| --- | --- | --- |",
    ...plan.modelPlan.map((r) => `| ${r.scenario} | ${r.model} | ${r.reason} |`),
    "",
    "## Concurrency plan",
    `- Chat: ${plan.concurrencyPlan.chatConcurrency}`,
    `- Image: ${plan.concurrencyPlan.imageConcurrency}`,
    `- Batch items/job: ${plan.concurrencyPlan.batchItemsPerJob}`,
    `- Batch poll interval: ${plan.concurrencyPlan.batchPollIntervalSeconds}s`,
    "",
    "## Retry / backoff",
    ...plan.retryPlan.map((r) => `- **${r.error}**: ${r.action}`),
    "",
    "## API Key security",
    ...plan.securityNotes.map((l) => `- ${l}`),
    "",
    "## Usage / Credits reconciliation",
    ...plan.reconciliationSteps.map((l) => `- ${l}`),
    "",
    "## Rollout steps",
    ...plan.rolloutSteps.map((l, i) => `${i + 1}. ${l}`),
    "",
    "## Go-live acceptance",
    ...plan.acceptanceChecklist.map((l, i) => `- [ ] ${l}`),
  ];
  if (plan.boundaryNote) {
    lines.push("", "## Boundary", plan.boundaryNote);
  }
  lines.push(
    "",
    "## Metadata",
    `- Industry: ${input.industry}`,
    `- Online users: ${input.onlineUsers}`,
    `- Workload: ${input.trafficShape}`,
    "",
    "**Share with:** " + plan.copyTargets.join(", ")
  );
  return lines.join("\n");
}

export function buildIntegrationPlanJson(
  plan: CustomerIntegrationPlan,
  input: CapacityPlannerInput
): string {
  return JSON.stringify(
    {
      title: plan.title,
      summary: plan.summary,
      input: {
        industry: input.industry,
        online_users: input.onlineUsers,
        traffic_shape: input.trafficShape,
        has_images: input.hasImages,
        needs_batch: input.needsBatch,
        latency_preference: input.latencyPreference,
        volume_preference: input.volumePreference,
      },
      recommended_architecture: plan.recommendedArchitecture,
      endpoint_split: plan.endpointSplit,
      model_plan: plan.modelPlan,
      concurrency_plan: {
        chat_concurrency: plan.concurrencyPlan.chatConcurrency,
        image_concurrency: plan.concurrencyPlan.imageConcurrency,
        batch_items_per_job: plan.concurrencyPlan.batchItemsPerJob,
        batch_poll_interval_seconds: plan.concurrencyPlan.batchPollIntervalSeconds,
      },
      retry_plan: plan.retryPlan,
      security_notes: plan.securityNotes,
      reconciliation_steps: plan.reconciliationSteps,
      rollout_steps: plan.rolloutSteps,
      go_live_checklist: plan.acceptanceChecklist,
      boundary_note: plan.boundaryNote ?? null,
      copy_targets: plan.copyTargets,
    },
    null,
    2
  );
}

export function buildGoLiveAcceptanceText(): string {
  return [
    "Tokfai go-live acceptance",
    "",
    ...GO_LIVE_ACCEPTANCE_ITEMS.map((item, i) => `${i + 1}. [ ] ${item}`),
    "",
    "Reconcile every request_id in Usage and Credits before scaling production traffic.",
  ].join("\n");
}

export function buildIntegrationPlanFromInput(input: CapacityPlannerInput): CustomerIntegrationPlan {
  return buildCustomerIntegrationPlan(input);
}

export function buildDefaultIntegrationPlanPlainText(): string {
  const input = {
    industry: "general" as const,
    onlineUsers: 100,
    trafficShape: "mixed" as const,
    hasImages: false,
    needsBatch: false,
    latencyPreference: "balanced" as const,
    volumePreference: "medium" as const,
  };
  const plan = buildCustomerIntegrationPlan(input);
  return buildIntegrationPlanPlainText(plan, input);
}
