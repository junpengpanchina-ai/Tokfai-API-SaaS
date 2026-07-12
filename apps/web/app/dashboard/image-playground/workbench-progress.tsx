"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  formatImagePlaygroundLabel,
  imagePlaygroundLabel,
  type ImagePlaygroundLocale,
} from "./image-playground-labels";

const IMAGE_STAGE_KEYS = [
  "dashboard.imageWorkbench.imageStage1",
  "dashboard.imageWorkbench.imageStage2",
  "dashboard.imageWorkbench.imageStage3",
  "dashboard.imageWorkbench.imageStage4",
  "dashboard.imageWorkbench.imageStage5",
  "dashboard.imageWorkbench.imageStage6",
] as const;

const VISION_STAGE_KEYS = [
  "dashboard.imageWorkbench.visionStage1",
  "dashboard.imageWorkbench.visionStage2",
  "dashboard.imageWorkbench.visionStage3",
  "dashboard.imageWorkbench.visionStage4",
  "dashboard.imageWorkbench.visionStage5",
] as const;

export type WorkbenchProgressKind = "vision" | "image_generate";

export function WorkbenchProgressPanel({
  kind,
  locale,
  title,
  patienceHint,
}: {
  kind: WorkbenchProgressKind;
  locale: ImagePlaygroundLocale;
  title: string;
  patienceHint: string;
}) {
  const stageKeys =
    kind === "image_generate" ? IMAGE_STAGE_KEYS : VISION_STAGE_KEYS;
  const stillRunningKey =
    kind === "image_generate"
      ? "dashboard.imageWorkbench.imageStageStillRunning"
      : "dashboard.imageWorkbench.visionStageStillRunning";

  const [elapsedSec, setElapsedSec] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setElapsedSec(0);
    setStageIndex(0);
    const tick = window.setInterval(() => {
      setElapsedSec((n) => n + 1);
    }, 1000);
    const stage = window.setInterval(() => {
      setStageIndex((i) => (i + 1) % stageKeys.length);
    }, 4500);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(stage);
    };
  }, [stageKeys.length]);

  const stageText = imagePlaygroundLabel(stageKeys[stageIndex], locale);
  const waitedLabel = formatImagePlaygroundLabel(
    imagePlaygroundLabel("dashboard.imageWorkbench.waitedSeconds", locale),
    { seconds: elapsedSec }
  );
  const longWait =
    elapsedSec >= 30
      ? imagePlaygroundLabel(stillRunningKey, locale)
      : patienceHint;

  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <div className="h-24 w-full max-w-xs animate-pulse rounded-md bg-muted/50" />
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        {title}
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{stageText}</p>
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
