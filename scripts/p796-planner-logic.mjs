/**
 * Mirror of apps/web/lib/customer-capacity-planner.ts for offline acceptance (no path aliases).
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const BATCH_POLL_INTERVAL_SECONDS = 5;

function clampOnlineUsers(n) {
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(Math.round(n), 10000);
}

function formatRange(min, max) {
  return `${min}–${max}`;
}

function getConcurrencyTier(onlineUsers) {
  if (onlineUsers <= 50) return { chat: [5, 10], image: [2, 3], batch: [50, 100] };
  if (onlineUsers <= 200) return { chat: [10, 20], image: [3, 5], batch: [100, 300] };
  if (onlineUsers <= 500) return { chat: [20, 25], image: [5, 8], batch: [300, 800] };
  return { chat: [25, 50], image: [5, 10], batch: [500, 1000] };
}

function recommendModel(input) {
  if (
    input.industry === "ecommerce" &&
    (input.trafficShape === "batch" || input.needsBatch || input.volumePreference === "large")
  ) {
    return "auto-cheap";
  }
  if (input.latencyPreference === "quality") return "auto-pro";
  return "auto-fast";
}

function isBatchFirstRecommended(input) {
  if (input.trafficShape === "batch" || input.needsBatch) return true;
  if (input.trafficShape === "chat" || input.trafficShape === "responses") return false;
  if (input.trafficShape === "image") return false;
  if (input.onlineUsers > 500) return true;
  if (input.onlineUsers > 200) return true;
  if (input.trafficShape === "mixed" && input.onlineUsers >= 100) return true;
  const batchFirstIndustries = ["hospital", "auto", "ecommerce", "support"];
  if (batchFirstIndustries.includes(input.industry)) return true;
  return false;
}

function recommendedPatternKey(input, batchFirst) {
  if (batchFirst) return "integration.capacityPlanner.pattern.batchFirst";
  if (input.trafficShape === "chat" || input.trafficShape === "responses") {
    return "integration.capacityPlanner.pattern.chatGovernor";
  }
  if (input.trafficShape === "image") return "integration.capacityPlanner.pattern.imageLow";
  return "integration.capacityPlanner.pattern.mixed";
}

function buildWarningKeys(input) {
  const keys = [];
  if (input.onlineUsers > 500) keys.push("integration.capacityPlanner.warning.highOnlineUsers");
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

export function planCapacity(raw) {
  const onlineUsers = clampOnlineUsers(raw.onlineUsers);
  const input = { ...raw, onlineUsers };
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
    batchFirstRecommended: batchFirst,
    warningNoteKeys: buildWarningKeys(input),
  };
}
