"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  formatImagePlaygroundLabel,
  imagePlaygroundLabel,
  type ImagePlaygroundLocale,
} from "./image-playground-labels";
import type { ImageGenerationTaskStatus } from "@/lib/dashboard-safe/image-api";

const VISION_STAGE_KEYS = [
  "dashboard.imageWorkbench.visionStage1",
  "dashboard.imageWorkbench.visionStage2",
  "dashboard.imageWorkbench.visionStage3",
  "dashboard.imageWorkbench.visionStage4",
  "dashboard.imageWorkbench.visionStage5",
] as const;

const STATUS_LABEL_KEYS: Record<string, string> = {
  queued: "dashboard.imageWorkbench.statusQueued",
  validating: "dashboard.imageWorkbench.statusValidating",
  billing_check: "dashboard.imageWorkbench.statusBillingCheck",
  requesting_model: "dashboard.imageWorkbench.statusRequestingModel",
  generating: "dashboard.imageWorkbench.statusGenerating",
  saving_result: "dashboard.imageWorkbench.statusSavingResult",
  completed: "dashboard.imageWorkbench.statusCompleted",
  failed: "dashboard.imageWorkbench.statusFailed",
  retryable_timeout: "dashboard.imageWorkbench.statusFailed",
  succeeded: "dashboard.imageWorkbench.statusCompleted",
  running: "dashboard.imageWorkbench.statusGenerating",
};

/** Time-based estimate: 0→80 over ESTIMATE_MS; 80–95 waits for real result. */
const ESTIMATE_MS = 45_000;

export type WorkbenchProgressKind = "vision" | "image_generate";

function mergeProgress(
  elapsedMs: number,
  serverProgress: number | null
): number {
  const timeEstimate = Math.min(80, (elapsedMs / ESTIMATE_MS) * 80);

  if (serverProgress == null) {
    if (elapsedMs >= ESTIMATE_MS) {
      return Math.min(95, 80 + ((elapsedMs - ESTIMATE_MS) / 60_000) * 15);
    }
    return timeEstimate;
  }

  if (serverProgress >= 100) return 95;
  if (serverProgress >= 80) {
    return Math.min(95, Math.max(80, Math.max(timeEstimate, serverProgress)));
  }
  return Math.max(timeEstimate, Math.min(80, serverProgress));
}

export function WorkbenchProgressPanel({
  kind,
  locale,
  title,
  patienceHint,
  serverStatus,
  serverProgress,
}: {
  kind: WorkbenchProgressKind;
  locale: ImagePlaygroundLocale;
  title: string;
  patienceHint: string;
  serverStatus?: ImageGenerationTaskStatus | string | null;
  serverProgress?: number | null;
}) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const serverProgressRef = useRef<number | null>(null);

  useEffect(() => {
    serverProgressRef.current =
      typeof serverProgress === "number" && Number.isFinite(serverProgress)
        ? Math.max(0, Math.min(100, serverProgress))
        : null;
  }, [serverProgress]);

  useEffect(() => {
    setElapsedSec(0);
    setStageIndex(0);
    setDisplayProgress(0);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setElapsedSec(Math.floor(elapsed / 1000));
      if (kind === "image_generate") {
        setDisplayProgress(
          Math.round(mergeProgress(elapsed, serverProgressRef.current))
        );
      }
    }, 250);

    const stage =
      kind === "vision"
        ? window.setInterval(() => {
            setStageIndex((i) => (i + 1) % VISION_STAGE_KEYS.length);
          }, 4500)
        : 0;

    return () => {
      window.clearInterval(tick);
      if (stage) window.clearInterval(stage);
    };
  }, [kind]);

  const waitedLabel = formatImagePlaygroundLabel(
    imagePlaygroundLabel("dashboard.imageWorkbench.waitedSeconds", locale),
    { seconds: elapsedSec }
  );

  let statusText: string;
  if (kind === "image_generate") {
    const key =
      (serverStatus && STATUS_LABEL_KEYS[serverStatus]) ||
      "dashboard.imageWorkbench.statusGenerating";
    statusText = imagePlaygroundLabel(key, locale);
  } else {
    statusText = imagePlaygroundLabel(VISION_STAGE_KEYS[stageIndex], locale);
  }

  const longWait =
    elapsedSec >= 30
      ? imagePlaygroundLabel(
          kind === "image_generate"
            ? "dashboard.imageWorkbench.imageStageStillRunning"
            : "dashboard.imageWorkbench.visionStageStillRunning",
          locale
        )
      : patienceHint;

  const percentLabel = formatImagePlaygroundLabel(
    imagePlaygroundLabel("dashboard.imageWorkbench.progressPercent", locale),
    { percent: displayProgress }
  );

  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      {kind === "image_generate" ? (
        <div className="w-full max-w-xs space-y-2">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayProgress}
            aria-label={percentLabel}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">{percentLabel}</p>
        </div>
      ) : (
        <div className="h-24 w-full max-w-xs animate-pulse rounded-md bg-muted/50" />
      )}
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        {title}
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{statusText}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{waitedLabel}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{longWait}</p>
    </div>
  );
}

/** Short handoff brief for copy tab — never dump the full recognition report. */
export function summarizeRecognitionForCopy(
  fullText: string,
  useCaseLabel: string
): string {
  const cleaned = fullText.replace(/\s+/g, " ").trim();
  const snippet = cleaned.slice(0, 180);
  return [
    `Recognition summary (for copywriting only): use case=${useCaseLabel}.`,
    snippet ? `Highlights: ${snippet}${cleaned.length > 180 ? "…" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Distill long copy into a short image-generation prompt. */
export function distillCopyToImagePrompt(fullText: string): string {
  const lines = fullText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine =
    lines.find((line) => /标题|title/i.test(line)) ??
    lines.find((line) => /^\d+[.、]/.test(line)) ??
    lines[0] ??
    "";
  const bullet =
    lines.find((line) => /^[-*•]/.test(line) || /卖点|bullet/i.test(line)) ?? "";
  const subject = titleLine.replace(/^[#*\d.、\s标题：:Title]+/i, "").slice(0, 60);
  const point = bullet.replace(/^[-*•\s卖点：:Bullets]+/i, "").slice(0, 60);
  return [
    subject
      ? `Subject: ${subject}`
      : "Subject: keep the person/product subject from the reference image",
    point ? `Selling-point mood: ${point}` : "Style: clean ecommerce hero lighting",
    "Composition: centered subject, moderate whitespace, ecommerce-ready",
    "Avoid: watermarks, cluttered background, distorted limbs",
  ].join("; ");
}
