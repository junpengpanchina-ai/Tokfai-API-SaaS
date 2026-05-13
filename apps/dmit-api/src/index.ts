import { serve } from "@hono/node-server";

import { buildApp } from "./app.js";
import { env } from "./env.js";
import { log } from "./logger.js";

const app = buildApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    log.info("dmit_listening", {
      port: info.port,
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
