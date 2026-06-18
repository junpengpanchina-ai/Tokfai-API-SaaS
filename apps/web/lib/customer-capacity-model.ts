/**
 * Customer-facing capacity model for Tokfai API gateway stability.
 * Not a guarantee of simultaneous upstream generation — see Docs capacity chapter.
 */

export const ONLINE_USERS_TARGET = 500;

export const RECOMMENDED_SYNC_CONCURRENCY = {
  min: 25,
  max: 50,
  label: "25–50",
} as const;

export const RECOMMENDED_BATCH_QUEUE = {
  min: 500,
  max: 1000,
  label: "500–1,000",
} as const;

export const RECOMMENDED_IMAGE_CONCURRENCY = {
  min: 5,
  max: 15,
  label: "5–15",
} as const;

export type CapacityLayerId =
  | "dashboard"
  | "api_keys"
  | "chat_sync"
  | "image_slow"
  | "batch_async"
  | "usage_credits";

export type CapacityLayer = {
  id: CapacityLayerId;
  titleKey: string;
  descriptionKey: string;
};

export const CAPACITY_LAYERS: CapacityLayer[] = [
  {
    id: "dashboard",
    titleKey: "integration.capacity.layers.dashboard.title",
    descriptionKey: "integration.capacity.layers.dashboard.desc",
  },
  {
    id: "api_keys",
    titleKey: "integration.capacity.layers.apiKeys.title",
    descriptionKey: "integration.capacity.layers.apiKeys.desc",
  },
  {
    id: "chat_sync",
    titleKey: "integration.capacity.layers.chatSync.title",
    descriptionKey: "integration.capacity.layers.chatSync.desc",
  },
  {
    id: "image_slow",
    titleKey: "integration.capacity.layers.imageSlow.title",
    descriptionKey: "integration.capacity.layers.imageSlow.desc",
  },
  {
    id: "batch_async",
    titleKey: "integration.capacity.layers.batchAsync.title",
    descriptionKey: "integration.capacity.layers.batchAsync.desc",
  },
  {
    id: "usage_credits",
    titleKey: "integration.capacity.layers.usageCredits.title",
    descriptionKey: "integration.capacity.layers.usageCredits.desc",
  },
];

export type ApiConcurrencyKind = "chat" | "image" | "batch";

export type ApiConcurrencyGuidance = {
  id: ApiConcurrencyKind;
  endpointKey: string;
  concurrencyKey: string;
  behaviorKey: string;
  reconcileKey: string;
};

export const API_CONCURRENCY_GUIDANCE: ApiConcurrencyGuidance[] = [
  {
    id: "chat",
    endpointKey: "integration.capacity.api.chat.endpoint",
    concurrencyKey: "integration.capacity.api.chat.concurrency",
    behaviorKey: "integration.capacity.api.chat.behavior",
    reconcileKey: "integration.capacity.api.chat.reconcile",
  },
  {
    id: "image",
    endpointKey: "integration.capacity.api.image.endpoint",
    concurrencyKey: "integration.capacity.api.image.concurrency",
    behaviorKey: "integration.capacity.api.image.behavior",
    reconcileKey: "integration.capacity.api.image.reconcile",
  },
  {
    id: "batch",
    endpointKey: "integration.capacity.api.batch.endpoint",
    concurrencyKey: "integration.capacity.api.batch.concurrency",
    behaviorKey: "integration.capacity.api.batch.behavior",
    reconcileKey: "integration.capacity.api.batch.reconcile",
  },
];

export const CAPACITY_READINESS_KEYS = [
  "integration.capacity.readiness.item1",
  "integration.capacity.readiness.item2",
  "integration.capacity.readiness.item3",
  "integration.capacity.readiness.item4",
  "integration.capacity.readiness.item5",
  "integration.capacity.readiness.item6",
  "integration.capacity.readiness.item7",
  "integration.capacity.readiness.item8",
] as const;

export const CAPACITY_ERROR_RESPONSE_KEYS = [
  "integration.capacity.errors.tooManyRequests",
  "integration.capacity.errors.gatewayOverloaded",
  "integration.capacity.errors.upstreamTimeout",
] as const;

export const CAPACITY_INDUSTRY_NOTE_KEYS = [
  "integration.capacity.industry.hospital",
  "integration.capacity.industry.automotive",
  "integration.capacity.industry.ecommerce",
  "integration.capacity.industry.support",
] as const;
