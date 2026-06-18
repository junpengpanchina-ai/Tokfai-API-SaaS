import {
  BATCH_POLL_INTERVAL_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
} from "@/lib/customer-retry-policy";

export type PlannerIndustry = "hospital" | "auto" | "ecommerce" | "support" | "general";

export type TrafficShape = "chat" | "responses" | "image" | "batch" | "mixed";

export type LatencyPreference = "fast" | "balanced" | "quality";

export type VolumePreference = "small" | "medium" | "large";

export type RecommendedModelId = "auto-fast" | "auto-pro" | "auto-cheap";

export const PLANNER_INDUSTRIES: PlannerIndustry[] = [
  "hospital",
  "auto",
  "ecommerce",
  "support",
  "general",
];

export const TRAFFIC_SHAPES: TrafficShape[] = [
  "chat",
  "responses",
  "image",
  "batch",
  "mixed",
];

export const ONLINE_USER_PRESETS = [50, 100, 500, 1000] as const;

export type CapacityPlannerInput = {
  industry: PlannerIndustry;
  onlineUsers: number;
  trafficShape: TrafficShape;
  hasImages: boolean;
  needsBatch: boolean;
  latencyPreference: LatencyPreference;
  volumePreference: VolumePreference;
};

export type CapacityPlannerOutput = {
  recommendedModel: RecommendedModelId;
  chatConcurrencyMin: number;
  chatConcurrencyMax: number;
  chatConcurrencyLabel: string;
  imageConcurrencyMin: number;
  imageConcurrencyMax: number;
  imageConcurrencyLabel: string;
  batchItemsPerJobMin: number;
  batchItemsPerJobMax: number;
  batchItemsLabel: string;
  batchPollIntervalSeconds: number;
  retryMaxAttempts: number;
  recommendedPatternKey: string;
  architectureKey: string;
  retrySummaryKey: string;
  batchWorkerKey: string;
  batchFirstRecommended: boolean;
  warningNoteKeys: string[];
  industryNoteKey: string;
  reconcilePathKeys: string[];
};

type ConcurrencyTier = {
  chat: [number, number];
  image: [number, number];
  batch: [number, number];
};

function clampOnlineUsers(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(Math.round(n), 10000);
}

function formatRange(min: number, max: number): string {
  return `${min}–${max}`;
}

function getConcurrencyTier(onlineUsers: number): ConcurrencyTier {
  if (onlineUsers <= 50) {
    return { chat: [5, 10], image: [2, 3], batch: [50, 100] };
  }
  if (onlineUsers <= 200) {
    return { chat: [10, 20], image: [3, 5], batch: [100, 300] };
  }
  if (onlineUsers <= 500) {
    return { chat: [20, 25], image: [5, 8], batch: [300, 800] };
  }
  return { chat: [25, 50], image: [5, 10], batch: [500, 1000] };
}

function recommendModel(input: CapacityPlannerInput): RecommendedModelId {
  if (
    input.industry === "ecommerce" &&
    (input.trafficShape === "batch" || input.needsBatch || input.volumePreference === "large")
  ) {
    return "auto-cheap";
  }
  if (input.latencyPreference === "quality") {
    return "auto-pro";
  }
  if (input.volumePreference === "large" || input.onlineUsers > 200) {
    return "auto-fast";
  }
  return "auto-fast";
}

function isBatchFirstRecommended(input: CapacityPlannerInput): boolean {
  if (input.trafficShape === "batch" || input.needsBatch) return true;
  if (input.trafficShape === "chat" || input.trafficShape === "responses") return false;
  if (input.trafficShape === "image") return false;
  if (input.onlineUsers > 500) return true;
  if (input.onlineUsers > 200) return true;
  if (input.trafficShape === "mixed" && input.onlineUsers >= 100) return true;
  const batchFirstIndustries: PlannerIndustry[] = ["hospital", "auto", "ecommerce", "support"];
  if (batchFirstIndustries.includes(input.industry)) return true;
  return false;
}

function recommendedPatternKey(input: CapacityPlannerInput, batchFirst: boolean): string {
  if (batchFirst) {
    return "integration.capacityPlanner.pattern.batchFirst";
  }
  if (input.trafficShape === "chat" || input.trafficShape === "responses") {
    return "integration.capacityPlanner.pattern.chatGovernor";
  }
  if (input.trafficShape === "image") {
    return "integration.capacityPlanner.pattern.imageLow";
  }
  return "integration.capacityPlanner.pattern.mixed";
}

function architectureKey(input: CapacityPlannerInput, batchFirst: boolean): string {
  if (batchFirst) {
    return `integration.capacityPlanner.architecture.${input.industry}.batchFirst`;
  }
  if (input.trafficShape === "image" || input.hasImages) {
    return `integration.capacityPlanner.architecture.${input.industry}.imageLow`;
  }
  return `integration.capacityPlanner.architecture.${input.industry}.chat`;
}

function industryNoteKey(industry: PlannerIndustry): string {
  return `integration.capacityPlanner.industryNotes.${industry}`;
}

function buildWarningKeys(input: CapacityPlannerInput): string[] {
  const keys: string[] = [];
  if (input.onlineUsers > 500) {
    keys.push("integration.capacityPlanner.warning.highOnlineUsers");
  }
  if (input.onlineUsers > 200 && input.trafficShape === "chat") {
    keys.push("integration.capacityPlanner.warning.chatAtScale");
  }
  if (input.hasImages || input.trafficShape === "image") {
    keys.push("integration.capacityPlanner.warning.imageLowConcurrency");
  }
  keys.push("integration.capacityPlanner.warning.retry429");
  keys.push("integration.capacityPlanner.warning.retry503");
  keys.push("integration.capacityPlanner.warning.retry504");
  return keys;
}

export function planCapacity(raw: CapacityPlannerInput): CapacityPlannerOutput {
  const onlineUsers = clampOnlineUsers(raw.onlineUsers);
  const input: CapacityPlannerInput = { ...raw, onlineUsers };
  const tier = getConcurrencyTier(onlineUsers);
  const batchFirst = isBatchFirstRecommended(input);
  const recommendedModel = recommendModel(input);

  let imageMin = tier.image[0];
  let imageMax = tier.image[1];
  if (!input.hasImages && input.trafficShape !== "image") {
    imageMin = Math.max(2, imageMin - 1);
    imageMax = Math.max(imageMin, imageMax - 2);
  }

  return {
    recommendedModel,
    chatConcurrencyMin: tier.chat[0],
    chatConcurrencyMax: tier.chat[1],
    chatConcurrencyLabel: formatRange(tier.chat[0], tier.chat[1]),
    imageConcurrencyMin: imageMin,
    imageConcurrencyMax: imageMax,
    imageConcurrencyLabel: formatRange(imageMin, imageMax),
    batchItemsPerJobMin: tier.batch[0],
    batchItemsPerJobMax: tier.batch[1],
    batchItemsLabel: formatRange(tier.batch[0], tier.batch[1]),
    batchPollIntervalSeconds: BATCH_POLL_INTERVAL_SECONDS,
    retryMaxAttempts: DEFAULT_MAX_ATTEMPTS,
    recommendedPatternKey: recommendedPatternKey(input, batchFirst),
    architectureKey: architectureKey(input, batchFirst),
    retrySummaryKey: "integration.capacityPlanner.retrySummary",
    batchWorkerKey: batchFirst
      ? "integration.capacityPlanner.batchWorkerRecommended"
      : "integration.capacityPlanner.batchWorkerOptional",
    batchFirstRecommended: batchFirst,
    warningNoteKeys: buildWarningKeys(input),
    industryNoteKey: industryNoteKey(input.industry),
    reconcilePathKeys: [
      "integration.capacityPlanner.reconcile1",
      "integration.capacityPlanner.reconcile2",
      "integration.capacityPlanner.reconcile3",
    ],
  };
}

export function buildRecommendedConfigSnippet(plan: CapacityPlannerOutput, industry: PlannerIndustry): string {
  return [
    "Tokfai integration plan (customer copy)",
    "",
    `industry: ${industry}`,
    `recommended_model: ${plan.recommendedModel}`,
    `chat_concurrency: ${plan.chatConcurrencyLabel}`,
    `image_concurrency: ${plan.imageConcurrencyLabel}`,
    `batch_items_per_job: ${plan.batchItemsLabel}`,
    `batch_poll_interval_seconds: ${plan.batchPollIntervalSeconds}`,
    `retry_max_attempts: ${plan.retryMaxAttempts}`,
    `batch_first: ${plan.batchFirstRecommended ? "yes" : "no"}`,
    "",
    "Next: copy traffic governor or batch worker from Dashboard → API Keys or Integration Workbench.",
    "Reconcile every request_id in Usage / Credits.",
  ].join("\n");
}

export const DEFAULT_PLANNER_INPUT: CapacityPlannerInput = {
  industry: "general",
  onlineUsers: 100,
  trafficShape: "mixed",
  hasImages: false,
  needsBatch: false,
  latencyPreference: "balanced",
  volumePreference: "medium",
};
