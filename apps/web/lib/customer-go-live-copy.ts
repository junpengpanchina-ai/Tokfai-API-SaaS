import { buildCustomerIntegrationPlan } from "@/lib/customer-integration-plan";
import type { CapacityPlannerInput } from "@/lib/customer-capacity-planner";
import {
  buildGoLiveTrackerPlan,
  type GoLiveTask,
  type GoLiveTaskState,
  type GoLiveTrackerPlan,
} from "@/lib/customer-go-live-tracker";

function taskLine(task: GoLiveTask, state?: GoLiveTaskState): string {
  const status = state?.status === "done" ? "[x]" : "[ ]";
  const evidence = state?.evidence?.trim() ? ` — Evidence: ${state.evidence.trim()}` : "";
  return `${status} ${task.title} (${task.phase}) — Owner: ${task.ownerHint}${evidence}`;
}

export function buildGoLiveTaskListPlainText(
  tracker: GoLiveTrackerPlan,
  taskStates: Record<string, GoLiveTaskState>
): string {
  const lines = [
    "Tokfai go-live task list",
    tracker.summary,
    "",
    ...tracker.tasks.map((task) => taskLine(task, taskStates[task.id])),
    "",
    "Update task status in Dashboard → Integration Workbench → Go-live tracker.",
  ];
  return lines.join("\n");
}

export function buildEvidencePackMarkdown(
  tracker: GoLiveTrackerPlan,
  taskStates: Record<string, GoLiveTaskState>
): string {
  const lines = [
    "# Tokfai evidence pack",
    "",
    tracker.summary,
    "",
    "## Task evidence",
    "",
  ];
  for (const task of tracker.tasks) {
    const state = taskStates[task.id];
    lines.push(
      `### ${task.title}`,
      `- Phase: ${task.phase}`,
      `- Owner: ${task.ownerHint}`,
      `- Expected: ${task.expectedOutput}`,
      `- Status: ${state?.status === "done" ? "done" : "pending"}`,
      `- Evidence: ${state?.evidence?.trim() || task.evidencePlaceholder}`,
      `- Docs: ${task.docsAnchor}`,
      ""
    );
  }
  lines.push("## Template reference", "", tracker.evidencePackMarkdown);
  return lines.join("\n");
}

export function buildFinalAcceptanceReport(
  input: CapacityPlannerInput,
  tracker: GoLiveTrackerPlan,
  taskStates: Record<string, GoLiveTaskState>
): string {
  const requestIdTask = taskStates["run-chat-request-id"];
  const usageTask = taskStates["search-usage-request-id"];
  const creditsTask = taskStates["search-credits-reference"];
  const monitorTask = taskStates["assign-monitoring-owner"];

  const base = tracker.acceptanceReport;
  return [
    base,
    "",
    "---",
    "Filled from tracker:",
    `request_id: ${requestIdTask?.evidence?.trim() || "[ pending ]"}`,
    `Usage evidence: ${usageTask?.evidence?.trim() || "[ pending ]"}`,
    `Credits evidence: ${creditsTask?.evidence?.trim() || "[ pending ]"}`,
    `Monitoring owner: ${monitorTask?.evidence?.trim() || "[ pending ]"}`,
    "",
    `Completed tasks: ${tracker.tasks.filter((t) => taskStates[t.id]?.status === "done").length}/${tracker.tasks.length}`,
  ].join("\n");
}

export function buildTechnicalHandoffNote(
  input: CapacityPlannerInput,
  tracker: GoLiveTrackerPlan,
  taskStates: Record<string, GoLiveTaskState>
): string {
  const plan = buildCustomerIntegrationPlan(input);
  const done = tracker.tasks.filter((t) => taskStates[t.id]?.status === "done").length;
  return [
    "Tokfai technical handoff note",
    "",
    plan.title,
    plan.summary,
    "",
    "Architecture:",
    ...plan.recommendedArchitecture.map((l) => `- ${l}`),
    "",
    "Go-live progress:",
    `${done}/${tracker.tasks.length} tracker tasks completed`,
    "",
    "Next owner actions:",
    ...tracker.tasks
      .filter((t) => taskStates[t.id]?.status !== "done")
      .slice(0, 5)
      .map((t) => `- ${t.title} → ${t.ownerHint}`),
    "",
    "Reconcile every request_id in Usage and Credits before scaling traffic.",
    "Docs: /dashboard/docs#go-live-tracker",
  ].join("\n");
}

export function buildGoLiveTrackerCopies(
  input: CapacityPlannerInput,
  taskStates: Record<string, GoLiveTaskState>
) {
  const tracker = buildGoLiveTrackerPlan(input);
  return {
    taskList: buildGoLiveTaskListPlainText(tracker, taskStates),
    evidencePack: buildEvidencePackMarkdown(tracker, taskStates),
    finalReport: buildFinalAcceptanceReport(input, tracker, taskStates),
    technicalHandoff: buildTechnicalHandoffNote(input, tracker, taskStates),
  };
}
