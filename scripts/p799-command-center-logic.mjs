/**
 * Mirror step ids for offline acceptance.
 */

export const COMMAND_CENTER_STEP_IDS = [
  "create-api-key",
  "verify-curl",
  "choose-workload",
  "plan-capacity",
  "generate-plan",
  "copy-templates",
  "go-live-tracker",
  "reconcile-usage-credits",
];

export const COMMAND_CENTER_STORAGE_KEY = "tokfai_integration_command_center_state";

export const DEFAULT_COMMAND_CENTER_STATE = {
  completedStepIds: [],
  activeStepId: "create-api-key",
  industry: "general",
  trafficShape: "mixed",
  onlineUsers: 100,
  recommendedModel: "auto-fast",
};
