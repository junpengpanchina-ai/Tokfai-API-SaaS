import {
  DEFAULT_PLANNER_INPUT,
  type CapacityPlannerInput,
  type PlannerIndustry,
  type RecommendedModelId,
  type TrafficShape,
  type VolumePreference,
  planCapacity,
} from "@/lib/customer-capacity-planner";

export const COMMAND_CENTER_STEP_IDS = [
  "create-api-key",
  "verify-curl",
  "choose-workload",
  "plan-capacity",
  "generate-plan",
  "copy-templates",
  "go-live-tracker",
  "reconcile-usage-credits",
] as const;

export type CommandCenterStepId = (typeof COMMAND_CENTER_STEP_IDS)[number];

export type CommandCenterStep = {
  id: CommandCenterStepId;
  titleKey: string;
  goalKey: string;
  nextActionKey: string;
  expectedOutputKey: string;
  reconcileHintKey?: string;
  troubleshootHintKey?: string;
};

export const INTEGRATION_COMMAND_CENTER_STEPS: CommandCenterStep[] = [
  {
    id: "create-api-key",
    titleKey: "integration.commandCenter.step.createKey.title",
    goalKey: "integration.commandCenter.step.createKey.goal",
    nextActionKey: "integration.commandCenter.step.createKey.nextAction",
    expectedOutputKey: "integration.commandCenter.step.createKey.expected",
    reconcileHintKey: "integration.commandCenter.step.createKey.reconcile",
  },
  {
    id: "verify-curl",
    titleKey: "integration.commandCenter.step.verifyCurl.title",
    goalKey: "integration.commandCenter.step.verifyCurl.goal",
    nextActionKey: "integration.commandCenter.step.verifyCurl.nextAction",
    expectedOutputKey: "integration.commandCenter.step.verifyCurl.expected",
    reconcileHintKey: "integration.commandCenter.step.verifyCurl.reconcile",
    troubleshootHintKey: "integration.troubleshooting.verifyCurlTroubleshoot",
  },
  {
    id: "choose-workload",
    titleKey: "integration.commandCenter.step.chooseWorkload.title",
    goalKey: "integration.commandCenter.step.chooseWorkload.goal",
    nextActionKey: "integration.commandCenter.step.chooseWorkload.nextAction",
    expectedOutputKey: "integration.commandCenter.step.chooseWorkload.expected",
  },
  {
    id: "plan-capacity",
    titleKey: "integration.commandCenter.step.planCapacity.title",
    goalKey: "integration.commandCenter.step.planCapacity.goal",
    nextActionKey: "integration.commandCenter.step.planCapacity.nextAction",
    expectedOutputKey: "integration.commandCenter.step.planCapacity.expected",
  },
  {
    id: "generate-plan",
    titleKey: "integration.commandCenter.step.generatePlan.title",
    goalKey: "integration.commandCenter.step.generatePlan.goal",
    nextActionKey: "integration.commandCenter.step.generatePlan.nextAction",
    expectedOutputKey: "integration.commandCenter.step.generatePlan.expected",
  },
  {
    id: "copy-templates",
    titleKey: "integration.commandCenter.step.copyTemplates.title",
    goalKey: "integration.commandCenter.step.copyTemplates.goal",
    nextActionKey: "integration.commandCenter.step.copyTemplates.nextAction",
    expectedOutputKey: "integration.commandCenter.step.copyTemplates.expected",
  },
  {
    id: "go-live-tracker",
    titleKey: "integration.commandCenter.step.goLiveTracker.title",
    goalKey: "integration.commandCenter.step.goLiveTracker.goal",
    nextActionKey: "integration.commandCenter.step.goLiveTracker.nextAction",
    expectedOutputKey: "integration.commandCenter.step.goLiveTracker.expected",
    reconcileHintKey: "integration.commandCenter.step.goLiveTracker.reconcile",
  },
  {
    id: "reconcile-usage-credits",
    titleKey: "integration.commandCenter.step.reconcile.title",
    goalKey: "integration.commandCenter.step.reconcile.goal",
    nextActionKey: "integration.commandCenter.step.reconcile.nextAction",
    expectedOutputKey: "integration.commandCenter.step.reconcile.expected",
    reconcileHintKey: "integration.commandCenter.step.reconcile.reconcile",
    troubleshootHintKey: "integration.troubleshooting.reconcileSearchUsage",
  },
];

export const COMMAND_CENTER_STORAGE_KEY = "tokfai_integration_command_center_state";

export type CommandCenterPersistedState = {
  completedStepIds: CommandCenterStepId[];
  activeStepId: CommandCenterStepId;
  industry: PlannerIndustry;
  trafficShape: TrafficShape;
  onlineUsers: number;
  recommendedModel: RecommendedModelId;
};

export const DEFAULT_COMMAND_CENTER_STATE: CommandCenterPersistedState = {
  completedStepIds: [],
  activeStepId: "create-api-key",
  industry: DEFAULT_PLANNER_INPUT.industry,
  trafficShape: DEFAULT_PLANNER_INPUT.trafficShape,
  onlineUsers: DEFAULT_PLANNER_INPUT.onlineUsers,
  recommendedModel: "auto-fast",
};

function volumeFromOnlineUsers(onlineUsers: number): VolumePreference {
  if (onlineUsers >= 500) return "large";
  if (onlineUsers >= 100) return "medium";
  return "small";
}

export function buildPlannerInputFromCommandCenter(
  state: CommandCenterPersistedState
): CapacityPlannerInput {
  const volumePreference = volumeFromOnlineUsers(state.onlineUsers);
  const hasImages =
    state.trafficShape === "image" ||
    state.trafficShape === "mixed" ||
    state.industry === "ecommerce";
  const needsBatch =
    state.trafficShape === "batch" || state.onlineUsers >= 500 || volumePreference === "large";

  let latencyPreference: CapacityPlannerInput["latencyPreference"] = "balanced";
  if (state.recommendedModel === "auto-pro") latencyPreference = "quality";
  if (state.recommendedModel === "auto-cheap") latencyPreference = "fast";

  return {
    industry: state.industry,
    onlineUsers: state.onlineUsers,
    trafficShape: state.trafficShape,
    hasImages,
    needsBatch,
    latencyPreference,
    volumePreference,
  };
}

export function stepAnchorId(stepId: CommandCenterStepId): string {
  return `command-center-step-${stepId}`;
}

export function nextStepId(current: CommandCenterStepId): CommandCenterStepId | null {
  const index = COMMAND_CENTER_STEP_IDS.indexOf(current);
  if (index < 0 || index >= COMMAND_CENTER_STEP_IDS.length - 1) return null;
  return COMMAND_CENTER_STEP_IDS[index + 1];
}

export function nextIncompleteStep(
  completedStepIds: CommandCenterStepId[]
): CommandCenterStep | null {
  for (const id of COMMAND_CENTER_STEP_IDS) {
    if (!completedStepIds.includes(id)) {
      return INTEGRATION_COMMAND_CENTER_STEPS.find((s) => s.id === id) ?? null;
    }
  }
  return null;
}

export function commandCenterSummary(planInput: CapacityPlannerInput) {
  const plan = planCapacity(planInput);
  return {
    recommendedModel: plan.recommendedModel,
    chatConcurrency: plan.chatConcurrencyLabel,
    imageConcurrency: plan.imageConcurrencyLabel,
    batchItems: plan.batchItemsLabel,
    batchFirst: plan.batchFirstRecommended,
  };
}
