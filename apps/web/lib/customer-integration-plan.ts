import {
  planCapacity,
  type CapacityPlannerInput,
  type PlannerIndustry,
} from "@/lib/customer-capacity-planner";

export type EndpointSplitRow = {
  workload: string;
  endpoint: string;
  whenToUse: string;
};

export type ModelPlanRow = {
  scenario: string;
  model: string;
  reason: string;
};

export type RetryPlanRow = {
  error: string;
  action: string;
};

export type CustomerIntegrationPlan = {
  title: string;
  summary: string;
  recommendedArchitecture: string[];
  endpointSplit: EndpointSplitRow[];
  modelPlan: ModelPlanRow[];
  concurrencyPlan: {
    chatConcurrency: string;
    imageConcurrency: string;
    batchItemsPerJob: string;
    batchPollIntervalSeconds: string;
  };
  retryPlan: RetryPlanRow[];
  securityNotes: string[];
  reconciliationSteps: string[];
  rolloutSteps: string[];
  acceptanceChecklist: string[];
  copyTargets: string[];
  boundaryNote?: string;
};

export const GO_LIVE_ACCEPTANCE_ITEMS: string[] = [
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

const INDUSTRY_TITLES: Record<PlannerIndustry, string> = {
  hospital: "Hospital AI integration plan",
  auto: "Automotive after-sales integration plan",
  ecommerce: "E-commerce integration plan",
  support: "AI customer service integration plan",
  general: "Tokfai API integration plan",
};

const COPY_TARGETS = [
  "Technical team / backend engineers",
  "IT security review",
  "Product or business owner",
  "Operations / on-call owner",
];

function industryArchitecture(industry: PlannerIndustry, batchFirst: boolean): string[] {
  const commonTail = [
    "Customer backend stores sk-tokfai API Key — route all Tokfai calls through your server.",
    "Log request_id from every API response for Usage / Credits reconciliation.",
  ];
  switch (industry) {
    case "hospital":
      return [
        "Customer HIS / CRM / ticketing system calls Tokfai from your backend.",
        ...commonTail,
        "Single consult summary: Chat traffic governor (real-time, capped concurrency).",
        "Chart prep / follow-up reminders / bulk summaries: Batch worker (poll with max attempts).",
        "Imaging text assist: Image API with low concurrency only.",
        "Reconcile every request_id in Usage and Credits before scaling volume.",
      ];
    case "auto":
      return [
        "Dealer CRM / service desk calls Tokfai from your backend.",
        ...commonTail,
        batchFirst
          ? "Ticket classification / bulk summaries: Batch worker first."
          : "Single ticket Q&A: Chat traffic governor.",
        "Single ticket Q&A: Chat governor when not batch-only.",
        "Damage photo description assist: Image low concurrency.",
        "Final repair decisions confirmed by your staff — not Tokfai.",
      ];
    case "ecommerce":
      return [
        "PIM / listing / CS tools call Tokfai from your backend.",
        ...commonTail,
        "SKU copy / bulk titles: Batch worker (auto-cheap for large catalog jobs).",
        "Product images: Image API — low concurrency.",
        "FAQ / CS reply drafts: Chat governor for real-time drafts.",
        "Human review before publishing listings or sending buyer messages.",
      ];
    case "support":
      return [
        "Helpdesk / ticket platform calls Tokfai per ticket from your backend.",
        ...commonTail,
        "Ticket routing / classification at scale: Batch worker.",
        "Reply drafts for agents: Chat governor (agent reviews before send).",
        "Conversation summaries: Batch worker for bulk tickets.",
        "Your CRM / webhook owns ticket status — Tokfai does not send to customers.",
      ];
    default:
      return [
        "Your application backend calls Tokfai — not the browser frontend.",
        ...commonTail,
        "Real-time user traffic: Chat or Responses with traffic governor queue.",
        "Slow image generation: Image API with low concurrency.",
        "Large volume copy / classification: Batch worker with safe polling.",
        "All successful requests reconciled by request_id in Usage / Credits.",
      ];
  }
}

function boundaryNote(industry: PlannerIndustry): string | undefined {
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

function endpointSplit(input: CapacityPlannerInput): EndpointSplitRow[] {
  const rows: EndpointSplitRow[] = [
    {
      workload: "Real-time Chat",
      endpoint: "POST /v1/chat/completions",
      whenToUse: "User-facing Q&A, CS drafts, single-ticket replies with queue + maxConcurrent.",
    },
    {
      workload: "Responses API",
      endpoint: "POST /v1/responses",
      whenToUse: "Same concurrency as Chat — for Responses-style clients.",
    },
    {
      workload: "Image generation",
      endpoint: "POST /v1/images/generations",
      whenToUse: "Slow generation — keep concurrency below Chat; conservative retry only.",
    },
    {
      workload: "Batch queue",
      endpoint: "POST /v1/batches/chat",
      whenToUse: "Bulk jobs — create batch, poll GET /v1/batches/{id}, list GET /v1/batches/{id}/items.",
    },
  ];
  if (input.trafficShape === "chat") {
    return rows.filter((r) => r.workload === "Real-time Chat");
  }
  if (input.trafficShape === "responses") {
    return rows.filter((r) => r.workload === "Responses API");
  }
  if (input.trafficShape === "image") {
    return rows.filter((r) => r.workload === "Image generation");
  }
  if (input.trafficShape === "batch") {
    return rows.filter((r) => r.workload === "Batch queue");
  }
  return rows;
}

function modelPlan(
  input: CapacityPlannerInput,
  capacityModel: string,
  batchFirst: boolean
): ModelPlanRow[] {
  const rows: ModelPlanRow[] = [
    {
      scenario: "Default real-time Chat / Responses",
      model: capacityModel,
      reason:
        input.latencyPreference === "quality"
          ? "Quality preference — auto-pro for stronger reasoning."
          : "Balanced / fast traffic — auto-fast stable alias with upstream fallback.",
    },
  ];
  if (input.industry === "ecommerce" && batchFirst) {
    rows.push({
      scenario: "Bulk SKU / catalog copy",
      model: "auto-cheap",
      reason: "Low-cost batch copy for hundreds of listings.",
    });
  }
  if (input.hasImages || input.trafficShape === "image" || input.industry === "ecommerce") {
    rows.push({
      scenario: "Product / assist images",
      model: "gpt-image-2",
      reason: "Image API — low concurrency, reconcile request_id per image.",
    });
  }
  if (batchFirst) {
    rows.push({
      scenario: "Batch classification / summaries",
      model: capacityModel,
      reason: "Batch jobs use same chat model — each succeeded item has its own request_id.",
    });
  }
  return rows;
}

function retryPlan(maxAttempts: number): RetryPlanRow[] {
  return [
    {
      error: "429 too_many_requests",
      action: "Reduce client concurrency, wait 5–30s, exponential backoff, max " + maxAttempts + " attempts.",
    },
    {
      error: "503 gateway_overloaded",
      action: "Reduce concurrency, try auto-fast, move bulk to Batch worker.",
    },
    {
      error: "504 upstream_timeout",
      action: "Search Usage by request_id first — if no debit, retry with backoff.",
    },
    {
      error: "401 invalid_token / 402 insufficient_credits",
      action: "Do not retry blindly — fix API Key or recharge Credits.",
    },
    {
      error: "400 invalid_request_error",
      action: "Fix request body — do not infinite-retry.",
    },
  ];
}

function rolloutSteps(batchFirst: boolean): string[] {
  const steps = [
    "Create API Key in Dashboard → store on customer backend only.",
    "Copy one-line Chat curl — verify HTTP 200 and request_id.",
    "Deploy Chat traffic governor with recommended concurrency.",
    "Configure retry/backoff (max 3 attempts) on all workers.",
  ];
  if (batchFirst) {
    steps.push("Deploy Batch worker — test create, poll, items, per-item request_id.");
  }
  steps.push(
    "Enable Image low concurrency if image workload is included.",
    "Reconcile pilot traffic in Usage / Credits before full rollout.",
    "Assign on-call owner for 429 / 503 / 504 playbooks."
  );
  return steps;
}

function reconciliationSteps(): string[] {
  return [
    "Log request_id from every API response in your application logs.",
    "Dashboard → Usage — search by request_id.",
    "Dashboard → Credits — match reference_id or debit line to request_id.",
    "Batch jobs — reconcile each succeeded item request_id separately.",
    "Before re-submitting after 504, confirm no Usage row for that request_id.",
  ];
}

function securityNotes(): string[] {
  return [
    "Never embed sk-tokfai_* keys in public web pages, mobile apps, or browser extensions.",
    "Route Tokfai calls through your own backend server that holds the API Key.",
    "Apply queue, concurrency limits, and safe retry on the server — not in the browser.",
    "Rotate keys via Dashboard revoke + new key — test revoke flow before go-live.",
    "Tokfai provides API access — you operate your application stack and data boundaries.",
  ];
}

function summary(input: CapacityPlannerInput, capacity: ReturnType<typeof planCapacity>): string {
  const industryLabel = INDUSTRY_TITLES[input.industry];
  return `${industryLabel} for ~${input.onlineUsers} online users. Primary workload: ${input.trafficShape}. Recommended model: ${capacity.recommendedModel}. Chat concurrency ${capacity.chatConcurrencyLabel}, Image ${capacity.imageConcurrencyLabel}, Batch ${capacity.batchItemsLabel} items/job. ${capacity.batchFirstRecommended ? "Batch-first recommended for bulk." : "Chat governor for primary sync traffic."}`;
}

export function buildCustomerIntegrationPlan(input: CapacityPlannerInput): CustomerIntegrationPlan {
  const capacity = planCapacity(input);
  const batchFirst = capacity.batchFirstRecommended;

  return {
    title: INDUSTRY_TITLES[input.industry],
    summary: summary(input, capacity),
    recommendedArchitecture: industryArchitecture(input.industry, batchFirst),
    endpointSplit: endpointSplit(input),
    modelPlan: modelPlan(input, capacity.recommendedModel, batchFirst),
    concurrencyPlan: {
      chatConcurrency: capacity.chatConcurrencyLabel + " per application",
      imageConcurrency: capacity.imageConcurrencyLabel + " per application",
      batchItemsPerJob: capacity.batchItemsLabel,
      batchPollIntervalSeconds: String(capacity.batchPollIntervalSeconds),
    },
    retryPlan: retryPlan(capacity.retryMaxAttempts),
    securityNotes: securityNotes(),
    reconciliationSteps: reconciliationSteps(),
    rolloutSteps: rolloutSteps(batchFirst),
    acceptanceChecklist: [...GO_LIVE_ACCEPTANCE_ITEMS],
    copyTargets: [...COPY_TARGETS],
    boundaryNote: boundaryNote(input.industry),
  };
}
