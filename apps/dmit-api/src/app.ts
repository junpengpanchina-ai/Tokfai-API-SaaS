import { Hono } from "hono";

import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { corsMiddleware } from "./middleware/cors.js";
import { requestIdMiddleware } from "./middleware/requestId.js";

import { healthRoutes } from "./routes/health.js";
import { keyRoutes } from "./routes/keys.js";
import { billingRoutes } from "./routes/billing.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { modelRoutes } from "./routes/models.js";
import { chatRoutes } from "./routes/chat.js";

export function buildApp() {
  const app = new Hono();

  app.use("*", requestIdMiddleware);
  app.use("*", corsMiddleware);

  app.route("/", healthRoutes);
  app.route("/", keyRoutes);
  app.route("/", billingRoutes);
  app.route("/", webhookRoutes);
  app.route("/", modelRoutes);
  app.route("/", chatRoutes);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
