import {
  buildBatchCreateCurlOneLine,
  buildBatchCreateCurlPowerShellOneLine,
} from "@/lib/customer-batch-api-chapter";
import {
  batchCreateCurlOneLine,
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
  imageCurlOneLine,
} from "@/lib/customer-curl-oneline";
import { buildImageApiCurlPowerShellOneLine } from "@/lib/customer-image-api-chapter";

export type CustomerApiPathId = "chat" | "image" | "batch";

export type CustomerApiPathDef = {
  id: CustomerApiPathId;
  titleKey: string;
  endpointKey: string;
  concurrencyKey: string;
  syncKey: string;
  pollingKey: string;
  online500Key: string;
  docsHash: string;
};

export const CUSTOMER_API_PATHS: CustomerApiPathDef[] = [
  {
    id: "chat",
    titleKey: "integration.apiPath.chat.title",
    endpointKey: "integration.apiPath.chat.endpoint",
    concurrencyKey: "integration.apiPath.chat.concurrency",
    syncKey: "integration.apiPath.chat.sync",
    pollingKey: "integration.apiPath.chat.polling",
    online500Key: "integration.apiPath.chat.online500",
    docsHash: "retry-and-backoff",
  },
  {
    id: "image",
    titleKey: "integration.apiPath.image.title",
    endpointKey: "integration.apiPath.image.endpoint",
    concurrencyKey: "integration.apiPath.image.concurrency",
    syncKey: "integration.apiPath.image.sync",
    pollingKey: "integration.apiPath.image.polling",
    online500Key: "integration.apiPath.image.online500",
    docsHash: "slow-upstream-behavior",
  },
  {
    id: "batch",
    titleKey: "integration.apiPath.batch.title",
    endpointKey: "integration.apiPath.batch.endpoint",
    concurrencyKey: "integration.apiPath.batch.concurrency",
    syncKey: "integration.apiPath.batch.sync",
    pollingKey: "integration.apiPath.batch.polling",
    online500Key: "integration.apiPath.batch.online500",
    docsHash: "large-volume-batch-queue",
  },
];

export function buildApiPathCurlOneLine(
  pathId: CustomerApiPathId,
  apiKey: string
): string {
  switch (pathId) {
    case "chat":
      return chatCurlOneLine(apiKey);
    case "image":
      return imageCurlOneLine(apiKey);
    case "batch":
      return batchCreateCurlOneLine(apiKey);
  }
}

export function buildApiPathCurlPowerShellOneLine(
  pathId: CustomerApiPathId,
  apiKey: string
): string {
  switch (pathId) {
    case "chat":
      return chatCurlPowerShellOneLine(apiKey);
    case "image":
      return buildImageApiCurlPowerShellOneLine(apiKey);
    case "batch":
      return buildBatchCreateCurlPowerShellOneLine(apiKey);
  }
}
