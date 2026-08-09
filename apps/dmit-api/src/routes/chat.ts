import { Hono } from "hono";

import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { chatGatewayMiddleware } from "../middleware/chatGateway.js";
import { runChatCompletionsHttp } from "../lib/runChatCompletionsHttp.js";

/**
 * /v1/chat/completions — OpenAI-compatible chat completions, customer-facing.
 *
 * Auth is handled by requireApiKeyOrSupabaseJwt (sk-tokfai_ or Supabase JWT).
 * Non-stream requests return JSON; stream=true returns OpenAI-compatible SSE
 * ending with data: [DONE]. After auth / rate-limit / balance precheck /
 * schema normalize, the first role chunk is flushed immediately — before
 * upstream returns. Remaining chunks are synthesized from the completed
 * upstream response. Precheck failures still use the JSON error envelope.
 *
 * Cherry Studio / OpenAI SDK bodies are normalized/sanitized BEFORE schema
 * validation. Empty / all-empty-content messages return a 200 not_billable
 * noop (never upstream, never debit). Validation 400s always return a concrete
 * JSON error envelope via respondApiError (never empty body / undefined message).
 *
 * Pipeline implementation: runChatCompletionsHttp (shared with Azure ingress).
 */
export const chatRoutes = new Hono();

chatRoutes.use("/v1/chat/completions", requireApiKeyOrSupabaseJwt);
chatRoutes.use("/v1/chat/completions", chatGatewayMiddleware);

chatRoutes.post("/v1/chat/completions", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  return runChatCompletionsHttp(c, {
    caller,
    requestId,
    route: "/v1/chat/completions",
  });
});
