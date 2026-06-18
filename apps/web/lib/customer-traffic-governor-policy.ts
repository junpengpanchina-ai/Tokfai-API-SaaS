export const REALTIME_CHAT_GOVERNOR = {
  recommendedConcurrencyMin: 10,
  recommendedConcurrencyMax: 25,
  burstLimit: 50,
  retryPolicyKey: "integration.trafficGovernor.chatRetryNote",
  useCaseKey: "integration.trafficGovernor.chatUseCase",
  endpoint: "/v1/chat/completions",
} as const;

export const RESPONSES_GOVERNOR = {
  recommendedConcurrencyMin: 10,
  recommendedConcurrencyMax: 25,
  burstLimit: 50,
  retryPolicyKey: "integration.trafficGovernor.responsesRetryNote",
  useCaseKey: "integration.trafficGovernor.responsesUseCase",
  endpoint: "/v1/responses",
} as const;

export const IMAGE_GOVERNOR = {
  recommendedConcurrencyMin: 3,
  recommendedConcurrencyMax: 10,
  burstLimit: 15,
  retryPolicyKey: "integration.trafficGovernor.imageRetryNote",
  useCaseKey: "integration.trafficGovernor.imageUseCase",
  endpoint: "/v1/images/generations",
} as const;

export const BATCH_WORKER_GOVERNOR = {
  recommendedItemsPerJobMin: 100,
  recommendedItemsPerJobMax: 1000,
  recommendedPollIntervalSecondsMin: 3,
  recommendedPollIntervalSecondsMax: 10,
  maxPollAttempts: 60,
  useCaseKey: "integration.trafficGovernor.batchUseCase",
  endpoint: "/v1/batches/chat",
} as const;

export type TrafficGovernorKind = "chat" | "image" | "batch" | "responses";

export const TRAFFIC_GOVERNOR_CONCURRENCY_TABLE = [
  {
    kind: "chat" as const,
    labelKey: "integration.trafficGovernor.tableChat",
    concurrencyKey: "integration.trafficGovernor.tableChatConcurrency",
    endpoint: REALTIME_CHAT_GOVERNOR.endpoint,
    burstKey: "integration.trafficGovernor.tableChatBurst",
  },
  {
    kind: "responses" as const,
    labelKey: "integration.trafficGovernor.tableResponses",
    concurrencyKey: "integration.trafficGovernor.tableResponsesConcurrency",
    endpoint: RESPONSES_GOVERNOR.endpoint,
    burstKey: "integration.trafficGovernor.tableResponsesBurst",
  },
  {
    kind: "image" as const,
    labelKey: "integration.trafficGovernor.tableImage",
    concurrencyKey: "integration.trafficGovernor.tableImageConcurrency",
    endpoint: IMAGE_GOVERNOR.endpoint,
    burstKey: "integration.trafficGovernor.tableImageBurst",
  },
  {
    kind: "batch" as const,
    labelKey: "integration.trafficGovernor.tableBatch",
    concurrencyKey: "integration.trafficGovernor.tableBatchItems",
    endpoint: BATCH_WORKER_GOVERNOR.endpoint,
    burstKey: "integration.trafficGovernor.tableBatchPoll",
  },
] as const;

export const CLIENT_HTTP_ERROR_GUIDANCE = [
  {
    status: 429,
    actionKey: "integration.trafficGovernor.error429",
  },
  {
    status: 503,
    actionKey: "integration.trafficGovernor.error503",
  },
  {
    status: 504,
    actionKey: "integration.trafficGovernor.error504",
  },
  {
    status: 401,
    actionKey: "integration.trafficGovernor.error401",
  },
  {
    status: 402,
    actionKey: "integration.trafficGovernor.error402",
  },
  {
    status: 400,
    actionKey: "integration.trafficGovernor.error400",
  },
  {
    status: 413,
    actionKey: "integration.trafficGovernor.error413",
  },
] as const;

export const DEFAULT_CHAT_MAX_CONCURRENT = 15;
export const DEFAULT_IMAGE_MAX_CONCURRENT = 5;
