/**
 * Mirror of apps/web/lib/customer-integration-plan.ts for offline acceptance.
 */

import { planCapacity } from "./p796-planner-logic.mjs";

const INDUSTRY_TITLES = {
  hospital: "Hospital AI integration plan",
  auto: "Automotive after-sales integration plan",
  ecommerce: "E-commerce integration plan",
  support: "AI customer service integration plan",
  general: "Tokfai API integration plan",
};

const GO_LIVE_ACCEPTANCE_ITEMS = [
  "API Key created and stored on customer backend (never in browser frontend).",
  "One-line Chat curl returns HTTP 200 with your API Key.",
  "request_id copied from every successful response.",
  "Usage search by request_id returns the expected row.",
  "Credits ledger reference_id matches request_id (or linked debit line).",
  "Retry/backoff configured — max 3 attempts, 5s / 15s / 30s + jitter.",
  "Batch worker configured for large-volume jobs (create → poll → items).",
  "Image requests use low concurrency (below Chat limits).",
  "Client-side concurrency limit / traffic governor configured.",
  "No sk-tokfai_* key exposed in public browser frontend.",
  "429 / 503 / 504 handling tested — reduce concurrency, backoff, reconcile before retry.",
  "Revoke-old-key test completed (rotate key without downtime plan).",
  "Production monitoring owner assigned (request_id logging + Usage/Credits alerts).",
];

function boundaryNote(industry) {
  switch (industry) {
    case "hospital":
      return "Assistive organization only — no diagnosis, no treatment plans, no substitute for physician judgment.";
    case "auto":
      return "Assist information sorting — final repair and safety decisions stay with your staff.";
    case "ecommerce":
      return "You own product truthfulness, marketplace rules, and final published content.";
    case "support":
      return "Tokfai outputs suggested drafts — your agents review, approve, and send replies.";
    default:
      return undefined;
  }
}

function industryArchitecture(industry, batchFirst) {
  const arch = industryArchitectureLines(industry, batchFirst);
  return arch;
}

function industryArchitectureLines(industry, batchFirst) {
  switch (industry) {
    case "hospital":
      return [
        "Batch worker",
        "Chart prep / follow-up reminders / bulk summaries",
        "Chat traffic governor",
        "Image low concurrency",
      ];
    case "auto":
      return batchFirst
        ? ["Batch worker", "ticket classification", "Chat governor", "Image low concurrency"]
        : ["Chat governor", "Image low concurrency"];
    case "ecommerce":
      return ["Batch worker", "SKU copy", "Image low concurrency", "Chat governor"];
    case "support":
      return ["Batch worker", "ticket routing", "Chat governor", "conversation summary"];
    default:
      return ["Chat", "Image", "Batch", "request_id reconciliation"];
  }
}

function endpointSplit(input) {
  const all = [
    { workload: "Chat", endpoint: "POST /v1/chat/completions" },
    { workload: "Responses", endpoint: "POST /v1/responses" },
    { workload: "Image", endpoint: "POST /v1/images/generations" },
    { workload: "Batch", endpoint: "POST /v1/batches/chat" },
  ];
  if (input.trafficShape === "chat") return all.filter((r) => r.workload === "Chat");
  if (input.trafficShape === "batch") return all.filter((r) => r.workload === "Batch");
  return all;
}

export function buildCustomerIntegrationPlan(input) {
  const capacity = planCapacity(input);
  const batchFirst = capacity.batchFirstRecommended;
  let model = capacity.recommendedModel;
  if (
    input.industry === "ecommerce" &&
    (input.trafficShape === "batch" || input.needsBatch || input.volumePreference === "large")
  ) {
    model = "auto-cheap";
  }

  return {
    title: INDUSTRY_TITLES[input.industry],
    summary: `online ${input.onlineUsers} workload ${input.trafficShape}`,
    recommendedArchitecture: industryArchitectureLines(input.industry, batchFirst),
    endpointSplit: endpointSplit(input),
    modelPlan: [{ scenario: "default", model, reason: "recommended" }],
    concurrencyPlan: {
      chatConcurrency: capacity.chatConcurrencyLabel,
      imageConcurrency: capacity.imageConcurrencyLabel,
      batchItemsPerJob: capacity.batchItemsLabel,
      batchPollIntervalSeconds: String(capacity.batchPollIntervalSeconds),
    },
    retryPlan: [
      { error: "429", action: "reduce concurrency backoff" },
      { error: "503", action: "auto-fast Batch" },
      { error: "504", action: "Usage Credits request_id" },
    ],
    securityNotes: ["Never embed sk-tokfai in browser frontend", "backend stores API Key"],
    reconciliationSteps: ["request_id", "Usage", "Credits"],
    rolloutSteps: ["API Key", "Chat curl", "traffic governor"],
    acceptanceChecklist: GO_LIVE_ACCEPTANCE_ITEMS,
    batchFirstRecommended: batchFirst,
    boundaryNote: boundaryNote(input.industry),
  };
}
