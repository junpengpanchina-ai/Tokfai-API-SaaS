"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";

import { CopyConfigAction } from "@/components/copyable-snippet-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CapacityPlannerInput } from "@/lib/customer-capacity-planner";
import { buildGoLiveTrackerCopies } from "@/lib/customer-go-live-copy";
import {
  buildGoLiveTrackerPlan,
  GO_LIVE_PHASES,
  GO_LIVE_TRACKER_STORAGE_KEY,
  tasksByPhase,
  type GoLivePhase,
  type GoLiveTaskState,
  type GoLiveTrackerStorage,
} from "@/lib/customer-go-live-tracker";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

type GoLiveTrackerPanelProps = {
  input: CapacityPlannerInput;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showTitle?: boolean;
};

function phaseLabelKey(phase: GoLivePhase): string {
  return `integration.goLiveTracker.phase.${phase}`;
}

function loadStorage(input: CapacityPlannerInput): Record<string, GoLiveTaskState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GO_LIVE_TRACKER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GoLiveTrackerStorage;
    if (
      parsed.industry !== input.industry ||
      parsed.onlineUsers !== input.onlineUsers
    ) {
      return {};
    }
    return parsed.tasks ?? {};
  } catch {
    return {};
  }
}

function saveStorage(
  input: CapacityPlannerInput,
  tasks: Record<string, GoLiveTaskState>
) {
  if (typeof window === "undefined") return;
  const payload: GoLiveTrackerStorage = {
    industry: input.industry,
    onlineUsers: input.onlineUsers,
    tasks,
  };
  window.localStorage.setItem(GO_LIVE_TRACKER_STORAGE_KEY, JSON.stringify(payload));
}

export function GoLiveTrackerPanel({
  input,
  copiedId,
  onCopy,
  idPrefix = "go-live-tracker",
  showTitle = true,
}: GoLiveTrackerPanelProps) {
  const { t } = useI18n();
  const tracker = useMemo(() => buildGoLiveTrackerPlan(input), [input]);
  const [taskStates, setTaskStates] = useState<Record<string, GoLiveTaskState>>({});

  useEffect(() => {
    setTaskStates(loadStorage(input));
    // Reload when planner industry or scale changes — not every input field.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional partial key
  }, [input.industry, input.onlineUsers]);

  const updateTask = useCallback(
    (taskId: string, patch: Partial<GoLiveTaskState>) => {
      setTaskStates((prev) => {
        const next = {
          ...prev,
          [taskId]: {
            status: prev[taskId]?.status ?? "pending",
            evidence: prev[taskId]?.evidence ?? "",
            ...patch,
          },
        };
        saveStorage(input, next);
        return next;
      });
    },
    [input]
  );

  const copies = useMemo(
    () => buildGoLiveTrackerCopies(input, taskStates),
    [input, taskStates]
  );

  const doneCount = tracker.tasks.filter(
    (task) => taskStates[task.id]?.status === "done"
  ).length;
  const grouped = tasksByPhase(tracker.tasks);

  return (
    <div
      id="go-live-tracker"
      className="flex flex-col gap-4 rounded-lg border-2 border-emerald-500/25 bg-background/80 p-4"
    >
      {showTitle ? (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardList className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {t("integration.goLiveTracker.title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.goLiveTracker.note")}
          </p>
        </div>
      ) : null}

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <p className="font-semibold text-foreground">{tracker.summary}</p>
        <p className="mt-2 text-muted-foreground">
          {formatMessage(t("integration.goLiveTracker.progress"), {
            done: doneCount,
            total: tracker.tasks.length,
          })}
        </p>
      </div>

      {GO_LIVE_PHASES.map((phase) => {
        const phaseTasks = grouped[phase];
        if (phaseTasks.length === 0) return null;
        return (
          <div key={phase} className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(phaseLabelKey(phase))}
            </p>
            {phaseTasks.map((task) => {
              const state = taskStates[task.id];
              const isDone = state?.status === "done";
              const docsHref = task.docsAnchor.startsWith("/")
                ? task.docsAnchor
                : `/dashboard/docs${task.docsAnchor.startsWith("#") ? task.docsAnchor : `#${task.docsAnchor}`}`;
              return (
                <div
                  key={task.id}
                  className="rounded-lg border bg-card p-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={t("integration.goLiveTracker.toggleDone")}
                      onClick={() =>
                        updateTask(task.id, {
                          status: isDone ? "pending" : "done",
                        })
                      }
                    >
                      <CheckCircle2
                        className={`h-5 w-5 ${isDone ? "text-emerald-600" : "text-muted-foreground/40"}`}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {task.title}
                        {task.required ? null : (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({t("integration.goLiveTracker.optional")})
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("integration.goLiveTracker.owner")}: {task.ownerHint}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("integration.goLiveTracker.expected")}: {task.expectedOutput}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      {t("integration.goLiveTracker.evidence")}
                    </Label>
                    <textarea
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder={task.evidencePlaceholder}
                      value={state?.evidence ?? ""}
                      onChange={(e) =>
                        updateTask(task.id, { evidence: e.target.value })
                      }
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CopyConfigAction
                      id={`${idPrefix}-copy-target-${task.id}`}
                      value={task.copyTarget}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.goLiveTracker.copyAction")}
                      copiedLabel={t("integration.goLiveTracker.copied")}
                    />
                    <Button asChild size="sm" variant="ghost">
                      <Link href={docsHref}>
                        {t("integration.goLiveTracker.docsLink")}
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <CopyConfigAction
          id={`${idPrefix}-copy-task-list`}
          value={copies.taskList}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.goLiveTracker.copyTaskList")}
          copiedLabel={t("integration.goLiveTracker.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-evidence-pack`}
          value={copies.evidencePack}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.goLiveTracker.copyEvidencePack")}
          copiedLabel={t("integration.goLiveTracker.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-final-report`}
          value={copies.finalReport}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.goLiveTracker.copyFinalReport")}
          copiedLabel={t("integration.goLiveTracker.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-technical-handoff`}
          value={copies.technicalHandoff}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.goLiveTracker.copyTechnicalHandoff")}
          copiedLabel={t("integration.goLiveTracker.copied")}
        />
      </div>
    </div>
  );
}
