"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const VISION_STAGES_ZH = [
  "已收到图片，正在读取素材信息…",
  "正在识别商品主体、场景和卖点…",
  "正在结合你的用途整理输出…",
  "正在生成适合电商运营的内容…",
  "即将完成，请稍等…",
];

const VISION_STAGES_EN = [
  "Image received — reading your asset…",
  "Identifying subject, scene, and selling points…",
  "Organizing output for your use case…",
  "Drafting ecommerce-ready content…",
  "Almost done — please wait…",
];

const IMAGE_GEN_STAGES_ZH = [
  "已收到生成任务，正在准备参考图…",
  "正在理解主体、风格和构图要求…",
  "图片模型正在生成，通常需要 20～90 秒…",
  "正在取回生成结果…",
  "正在写入用量记录，请稍等…",
];

const IMAGE_GEN_STAGES_EN = [
  "Task received — preparing reference images…",
  "Understanding subject, style, and composition…",
  "Image model is generating — usually 20–90 seconds…",
  "Fetching the generated result…",
  "Writing usage records — please wait…",
];

export type WorkbenchProgressKind = "vision" | "image_generate";

export function WorkbenchProgressPanel({
  kind,
  locale,
  title,
  patienceHint,
}: {
  kind: WorkbenchProgressKind;
  locale: "en" | "zh";
  title: string;
  patienceHint: string;
}) {
  const stages =
    kind === "image_generate"
      ? locale === "zh"
        ? IMAGE_GEN_STAGES_ZH
        : IMAGE_GEN_STAGES_EN
      : locale === "zh"
        ? VISION_STAGES_ZH
        : VISION_STAGES_EN;

  const [elapsedSec, setElapsedSec] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setElapsedSec(0);
    setStageIndex(0);
    const tick = window.setInterval(() => {
      setElapsedSec((n) => n + 1);
    }, 1000);
    const stage = window.setInterval(() => {
      setStageIndex((i) => (i + 1) % stages.length);
    }, 4500);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(stage);
    };
  }, [stages.length]);

  const waitedLabel =
    locale === "zh" ? `已等待 ${elapsedSec} 秒` : `Waited ${elapsedSec}s`;

  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <div className="h-24 w-full max-w-xs animate-pulse rounded-md bg-muted/50" />
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        {title}
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{stages[stageIndex]}</p>
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        {waitedLabel}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">{patienceHint}</p>
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
    `识别摘要（仅供文案参考，请直接写文案，不要再拆图）：用途=${useCaseLabel}。`,
    snippet ? `要点：${snippet}${cleaned.length > 180 ? "…" : ""}` : "",
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
  const subject = titleLine.replace(/^[#*\d.、\s标题：:]+/, "").slice(0, 60);
  const point = bullet.replace(/^[-*•\s卖点：:]+/, "").slice(0, 60);
  return [
    subject ? `主体：${subject}` : "主体：根据参考图保留人物/商品主体",
    point ? `卖点氛围：${point}` : "风格：电商主图，干净布光",
    "构图：居中主体，留白适中，适合电商主图",
    "禁止：文字水印、杂乱背景、变形肢体",
  ].join("；");
}
