import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { requireApiKey } from "../middleware/apiKey.js";

/**
 * /v1/chat/completions — OpenAI-compatible chat completions, customer-facing.
 *
 * D2: skeleton only — declares route + auth.
 * D5: pricing + GRSAI passthrough + usage_logs write + debit_credits RPC.
 */
export const chatRoutes = new Hono();

chatRoutes.use("/v1/chat/completions", requireApiKey);

chatRoutes.post("/v1/chat/completions", () => {
  throw ApiError.notImplemented(
    "POST /v1/chat/completions lands in D5.",
    "not_implemented"
  );
});
