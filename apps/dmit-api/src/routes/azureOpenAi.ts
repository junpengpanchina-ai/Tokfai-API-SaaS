import { Hono } from "hono";

import { ApiError } from "../errors.js";
import {
  applyAzureDeploymentModel,
  logAzureOpenAiIngress,
  parseAzureDeploymentParam,
  passThroughSharedChatResponse,
} from "../lib/azureOpenAiIngress.js";
import { readJsonBodyWithLimit } from "../lib/readJsonBodyWithLimit.js";
import { runChatCompletionsHttp } from "../lib/runChatCompletionsHttp.js";
import { getChatCaller } from "../middleware/chatAuth.js";
import { requireAzureOpenAiAuth } from "../middleware/azureAuth.js";
import { chatGatewayMiddleware } from "../middleware/chatGateway.js";
import {
  gatewayLimitKey,
  getGlobalUpstreamInflight,
  getKeyInflight,
} from "../gateway/concurrency.js";
import { logGatewayRejection } from "./chatGatewayLogs.js";

/**
 * P1067 / P1070 — Azure OpenAI compatibility ingress for Cursor Azure mode.
 *
 * POST /v1/openai/deployments/:deployment/chat/completions
 *   ?api-version=2024-12-01-preview
 *
 * Thin boundary only:
 *   - api-key / Bearer auth compatibility
 *   - deployment → model normalization (deployment authoritative)
 *   - api-version accepted as metadata (no capability change)
 *   - P1070: pass through shared Response status/headers/body (no JSON rewrap)
 *
 * Then reuses the production /v1/chat/completions pipeline
 * (runChatCompletionsHttp → executeChatCompletion / early SSE).
 *
 * No Cursor Agent orchestration. No tool execution rewrite.
 */
export const azureOpenAiRoutes = new Hono();

const AZURE_CHAT_PATH =
  "/v1/openai/deployments/:deployment/chat/completions";

azureOpenAiRoutes.use(AZURE_CHAT_PATH, requireAzureOpenAiAuth);
azureOpenAiRoutes.use(AZURE_CHAT_PATH, chatGatewayMiddleware);

azureOpenAiRoutes.post(AZURE_CHAT_PATH, async (c) => {
  const deploymentParam = c.req.param("deployment");
  const parsedDeployment = parseAzureDeploymentParam(deploymentParam);
  if (!parsedDeployment.ok) {
    throw parsedDeployment.error;
  }

  const { azureDeployment, normalizedModel } = parsedDeployment;
  const apiVersion = c.req.query("api-version");
  const apiVersionPresent =
    typeof apiVersion === "string" && apiVersion.trim().length > 0;

  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);

  let rawBody: unknown;
  try {
    rawBody = await readJsonBodyWithLimit(c);
  } catch (err) {
    if (err instanceof ApiError && err.code === "request_body_too_large") {
      await logGatewayRejection({
        caller,
        requestId,
        err,
        limitKey,
        keyInflight: await getKeyInflight(limitKey),
        globalInflight: await getGlobalUpstreamInflight(),
      });
    }
    throw err;
  }

  logAzureOpenAiIngress({
    requestId,
    azureDeployment,
    normalizedModel,
    apiVersionPresent,
  });

  const bodyWithModel = applyAzureDeploymentModel({
    rawBody,
    normalizedModel,
  });

  // P1070 — shared handler owns status/headers/body (incl. SSE).
  // Never re-encode the shared Response as a default-200 JSON write.
  const sharedResponse = await runChatCompletionsHttp(c, {
    caller,
    requestId,
    route: "/v1/openai/deployments/:deployment/chat/completions",
    rawBody: bodyWithModel,
  });
  return passThroughSharedChatResponse(sharedResponse);
});
