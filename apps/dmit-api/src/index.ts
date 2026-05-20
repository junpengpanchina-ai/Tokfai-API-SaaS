import { serve } from "@hono/node-server";

import { buildApp } from "./app.js";
import { env } from "./env.js";
import { log } from "./logger.js";
import { handleStripeWebhook } from "./routes/webhooks.js";

const app = buildApp();
app.post("/v1/webhooks/stripe", handleStripeWebhook);

const port = env.PORT;
const hostname = process.env.HOST?.trim() || "127.0.0.1";

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    log.info("dmit_listening", {
      address: info.address,
      port: info.port,
      hostname,
      env: env.NODE_ENV,
      cors: env.CORS_ALLOWED_ORIGINS,
    });
  }
);

function shutdown(signal: string) {
  log.info("dmit_shutdown", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
