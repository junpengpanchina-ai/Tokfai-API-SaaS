export type ImageTaskStatus =
  | "queued"
  | "validating"
  | "billing_check"
  | "requesting_model"
  | "generating"
  | "saving_result"
  | "completed"
  | "failed"
  | "retryable_timeout";

export interface ProgressMessagePair {
  en: string;
  zh: string;
}

const STATUS_MESSAGES: Record<ImageTaskStatus, ProgressMessagePair> = {
  queued: {
    en: "Queued",
    zh: "已排队",
  },
  validating: {
    en: "Validating request",
    zh: "正在校验请求",
  },
  billing_check: {
    en: "Checking credits",
    zh: "正在检查算力积分",
  },
  requesting_model: {
    en: "Sending request",
    zh: "正在发送请求",
  },
  generating: {
    en: "Generating image",
    zh: "正在生成图片",
  },
  saving_result: {
    en: "Saving result",
    zh: "正在保存结果",
  },
  completed: {
    en: "Completed",
    zh: "已完成",
  },
  failed: {
    en: "Failed",
    zh: "失败",
  },
  retryable_timeout: {
    en: "Timed out — you can retry",
    zh: "超时，可重试",
  },
};

export const STATUS_PROGRESS: Record<ImageTaskStatus, number> = {
  queued: 0,
  validating: 8,
  billing_check: 18,
  requesting_model: 28,
  generating: 55,
  saving_result: 90,
  completed: 100,
  failed: 100,
  retryable_timeout: 100,
};

export function messagesForStatus(status: ImageTaskStatus): ProgressMessagePair {
  return STATUS_MESSAGES[status];
}

export function isTerminalImageStatus(status: string): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "retryable_timeout"
  );
}

export function isInFlightImageStatus(status: string): boolean {
  return !isTerminalImageStatus(status);
}
