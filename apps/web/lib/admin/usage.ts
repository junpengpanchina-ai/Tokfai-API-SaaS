import { IMAGE_MODELS } from "@/lib/model-catalog";

const SUCCESS_STATUSES = new Set(["succeeded", "success", "ok"]);

const IMAGE_MODEL_IDS = new Set(IMAGE_MODELS.map((model) => model.id));

export type UsageRequestType = "chat" | "image" | "unknown";

export function isUsageSuccess(status: string | null | undefined): boolean {
  if (!status) return false;
  return SUCCESS_STATUSES.has(status.toLowerCase());
}

export function getUsageRequestType(model: string | null | undefined): UsageRequestType {
  if (!model) return "unknown";
  if (IMAGE_MODEL_IDS.has(model)) return "image";
  return "chat";
}

export type UsageLogStats = {
  totalRequests: number;
  succeeded: number;
  failed: number;
  imageRequests: number;
  chatRequests: number;
};

export function computeUsageLogStats<
  T extends { status: string | null; model: string | null }
>(logs: T[]): UsageLogStats {
  let succeeded = 0;
  let imageRequests = 0;
  let chatRequests = 0;

  for (const row of logs) {
    if (isUsageSuccess(row.status)) {
      succeeded += 1;
    }

    const requestType = getUsageRequestType(row.model);
    if (requestType === "image") {
      imageRequests += 1;
    } else if (requestType === "chat") {
      chatRequests += 1;
    }
  }

  const totalRequests = logs.length;

  return {
    totalRequests,
    succeeded,
    failed: Math.max(totalRequests - succeeded, 0),
    imageRequests,
    chatRequests,
  };
}
