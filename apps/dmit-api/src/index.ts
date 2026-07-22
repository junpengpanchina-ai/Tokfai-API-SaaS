import { serve } from "@hono/node-server";

import { buildApp } from "./app.js";
import { env, grsaiUpstreamTarget, maskSecret } from "./env.js";
import { log } from "./logger.js";
import { closeRedis, initRedis } from "./redis/client.js";
import { warnSupabaseAdminConfig } from "./supabase.js";

warnSupabaseAdminConfig();

await initRedis();

const app = buildApp();

const port = env.PORT;
const hostname = process.env.HOST?.trim() || "127.0.0.1";

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    const chatTarget = grsaiUpstreamTarget(env.GRSAI_CHAT_COMPLETIONS_PATH);
    log.info("dmit_listening", {
      address: info.address,
      port: info.port,
      hostname,
      env: env.NODE_ENV,
      cors: env.CORS_ALLOWED_ORIGINS,
    });
    log.info("dmit_grsai_upstream_config", {
      grsaiBaseHost: chatTarget.host,
      grsaiChatPath: chatTarget.path,
      grsaiApiKeyMask: maskSecret(env.GRSAI_API_KEY),
    });
  }
);

// Avoid Nginx upstream keepalive reuse of half-closed sockets after SSE
// (empty HTTP 400 with no content-type/body on the next proxied request).
const nodeServer = server as { keepAliveTimeout?: number; headersTimeout?: number };
if (typeof nodeServer.keepAliveTimeout === "number") {
  nodeServer.keepAliveTimeout = 1;
}
if (typeof nodeServer.headersTimeout === "number") {
  nodeServer.headersTimeout = 5_000;
}

function shutdown(signal: string) {
  log.info("dmit_shutdown", { signal });
  void closeRedis().finally(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
