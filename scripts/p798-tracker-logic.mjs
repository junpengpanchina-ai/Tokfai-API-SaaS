/**
 * Mirror of apps/web/lib/customer-go-live-tracker.ts for offline acceptance.
 */

import { planCapacity } from "./p796-planner-logic.mjs";
import { buildCustomerIntegrationPlan } from "./p797-plan-logic.mjs";

const GO_LIVE_PHASES = ["prepare", "connect", "validate", "scale", "handoff"];

function baseTasks(input, capacity) {
  const tasks = [
    { id: "create-api-key", phase: "prepare" },
    { id: "store-key-backend", phase: "prepare" },
    { id: "copy-chat-curl", phase: "prepare" },
    { id: "no-browser-key", phase: "prepare" },
    { id: "run-chat-request-id", phase: "connect" },
    { id: "connect-sdk-tools", phase: "connect" },
    { id: "configure-traffic-governor", phase: "connect" },
    { id: "configure-batch-worker", phase: "connect" },
  ];

  if (input.hasImages || input.trafficShape === "image" || input.industry === "ecommerce") {
    tasks.push({ id: "configure-image-low-concurrency", phase: "connect" });
  }

  tasks.push(
    { id: "search-usage-request-id", phase: "validate" },
    { id: "search-credits-reference", phase: "validate" },
    { id: "confirm-success-charged", phase: "validate" },
    { id: "confirm-failed-not-charged", phase: "validate" },
    { id: "confirm-error-handling", phase: "validate" },
    { id: "set-client-concurrency", phase: "scale" },
    { id: "batch-first-large-volume", phase: "scale" },
    { id: "enable-retry-backoff", phase: "scale" },
    { id: "assign-monitoring-owner", phase: "scale" },
    { id: "copy-integration-plan", phase: "handoff" },
    { id: "copy-go-live-acceptance", phase: "handoff" },
    { id: "copy-final-acceptance-report", phase: "handoff" },
    { id: "revoke-exposed-key", phase: "handoff" }
  );

  return tasks;
}

function industryTasks(industry) {
  switch (industry) {
    case "hospital":
      return [
        { id: "hospital-medical-boundary", phase: "validate" },
        { id: "hospital-doctor-review", phase: "handoff" },
      ];
    case "auto":
      return [{ id: "auto-enterprise-reviewer", phase: "handoff" }];
    case "ecommerce":
      return [{ id: "ecommerce-publish-review", phase: "handoff" }];
    case "support":
      return [{ id: "support-crm-owner", phase: "handoff" }];
    default:
      return [];
  }
}

export function buildGoLiveTrackerPlan(input) {
  const capacity = planCapacity(input);
  const integrationPlan = buildCustomerIntegrationPlan(input);
  const tasks = [...baseTasks(input, capacity), ...industryTasks(input.industry)];

  return {
    industry: input.industry,
    summary: `Go-live tracker for ${integrationPlan.title} (~${input.onlineUsers} online users).`,
    tasks,
    acceptanceReport: integrationPlan.summary,
    evidencePackMarkdown: integrationPlan.summary,
  };
}

export { GO_LIVE_PHASES };
