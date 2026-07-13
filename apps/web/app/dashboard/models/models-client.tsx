"use client";

import Link from "next/link";
import { BookOpen, Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DashboardCopyConfigAction,
  useDashboardCopyToClipboard,
} from "@/lib/dashboard-safe/copy-block";
import {
  CONSUMER_MODEL_GROUPS,
  type ConsumerModelCapabilityTag,
  type ConsumerModelCard,
} from "@/lib/docs/consumer-model-groups";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";
import type { ModelsClientData } from "@/lib/dashboard-safe/dtos/models";

const TAG_LABELS: Record<
  ConsumerModelCapabilityTag,
  { zh: string; en: string }
> = {
  recommended: { zh: "推荐", en: "Recommended" },
  fast: { zh: "Fast", en: "Fast" },
  best_quality: { zh: "高质量", en: "Best quality" },
  low_cost: { zh: "低成本", en: "Low cost" },
  image: { zh: "图片", en: "Image" },
  vision: { zh: "视觉", en: "Vision" },
  alias: { zh: "别名", en: "Alias" },
};

type LocalizedText = { zh: string; en: string };

function isGpt55Family(id: string): boolean {
  return (
    id === "gpt-5.5" ||
    id === "gpt-5.5-pro" ||
    id === "gpt-5-pro" ||
    id.startsWith("gpt-5.5")
  );
}

function recommendedEndpointForModel(model: ConsumerModelCard): LocalizedText {
  if (model.kind === "image") {
    return { zh: "/v1/images/generations", en: "/v1/images/generations" };
  }
  if (isGpt55Family(model.id)) {
    return { zh: "/v1/responses", en: "/v1/responses" };
  }
  if (model.id === "gpt-5.4" || model.id === "gpt-5.4-pro") {
    return {
      zh: "/v1/chat/completions 或 /v1/responses",
      en: "/v1/chat/completions or /v1/responses",
    };
  }
  if (model.id.startsWith("gemini")) {
    return {
      zh: "/v1/chat/completions 或 /v1beta",
      en: "/v1/chat/completions or /v1beta",
    };
  }
  if (model.kind === "alias" || model.id.startsWith("auto-")) {
    return {
      zh: "/v1/chat/completions 或 /v1/responses",
      en: "/v1/chat/completions or /v1/responses",
    };
  }
  return {
    zh: "/v1/chat/completions 或 /v1/responses",
    en: "/v1/chat/completions or /v1/responses",
  };
}

function suitabilityForModel(model: ConsumerModelCard): LocalizedText {
  if (model.kind === "image") {
    return {
      zh: "文生图、参考图改图",
      en: "Text-to-image and reference edits",
    };
  }
  if (isGpt55Family(model.id)) {
    return {
      zh: "复杂推理、代码、工具调用、Agent / Codex",
      en: "Complex reasoning, code, tools, Agent / Codex",
    };
  }
  if (model.id === "gpt-5.4" || model.id === "gpt-5.4-pro") {
    return {
      zh: "通用对话与文本任务",
      en: "General chat and text tasks",
    };
  }
  if (model.id.startsWith("gemini")) {
    return {
      zh: "长文本、多模态输入",
      en: "Long text and multimodal input",
    };
  }
  if (
    model.kind === "alias" ||
    model.id.startsWith("auto-") ||
    model.id.startsWith("gpt-5")
  ) {
    return {
      zh: "智能路由与通用对话",
      en: "Smart routing and general chat",
    };
  }
  return {
    zh: "通用对话与文本任务",
    en: "General chat and text tasks",
  };
}

function docAnchorForModel(model: ConsumerModelCard): string {
  if (model.kind === "image") return "/docs#image-api";
  if (model.id.startsWith("gemini")) return "/docs#gemini-native";
  if (isGpt55Family(model.id)) return "/docs#responses-api";
  return "/docs#chat-completions";
}

export function ModelsClient({
  modelsData,
}: {
  modelsData: ModelsClientData;
}) {
  const { locale } = useDashboardLabels();
  const zh = locale === "zh";

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {zh ? "模型" : "Models"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {zh
            ? "只讲模型能力与适合场景。价格请看定价页，接入方式请看文档页。"
            : "Capabilities and use cases only. Rates live on Pricing; integration lives on Docs."}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {zh
            ? "API Key 不绑定模型。请在请求体的 model 字段中填写模型 ID。"
            : "API keys are not bound to a model. Set the model ID in the request body's model field."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing">
              <Tags className="mr-1.5 h-3.5 w-3.5" />
              {zh ? "查看定价" : "View pricing"}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/docs">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              {zh ? "查看接入文档" : "View docs"}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{zh ? "可用模型" : "Available"}</CardDescription>
            <CardTitle className="text-2xl">
              {modelsData.stats.totalAvailable}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{zh ? "对话 / 推理" : "Chat / reasoning"}</CardDescription>
            <CardTitle className="text-2xl">
              {modelsData.stats.chatCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{zh ? "图片" : "Image"}</CardDescription>
            <CardTitle className="text-2xl">
              {modelsData.stats.imageCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {CONSUMER_MODEL_GROUPS.map((group) => (
        <section key={group.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {zh ? group.title.zh : group.title.en}
            </h2>
            <p className="text-sm text-muted-foreground">
              {zh ? group.description.zh : group.description.en}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {group.models.map((model) => (
              <ModelCapabilityCard
                key={`${group.id}-${model.id}`}
                model={model}
                zh={zh}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ModelCapabilityCard({
  model,
  zh,
}: {
  model: ConsumerModelCard;
  zh: boolean;
}) {
  const { t } = useDashboardLabels();
  const { copiedId, copyText } = useDashboardCopyToClipboard();
  const copyId = `model-id-${model.id}`;
  const endpoint = recommendedEndpointForModel(model);
  const suitability = suitabilityForModel(model);

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {zh ? model.displayName.zh : model.displayName.en}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                {model.id}
              </p>
              <DashboardCopyConfigAction
                id={copyId}
                value={model.id}
                copiedId={copiedId}
                onCopy={copyText}
                label={t("dashboard.models.copyModelId")}
                copiedLabel={t("dashboard.models.copied")}
              />
            </div>
          </div>
          <Badge variant="outline">{model.kind}</Badge>
        </div>
        <CardDescription>
          {zh ? model.oneLiner.zh : model.oneLiner.en}
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {model.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {zh ? TAG_LABELS[tag].zh : TAG_LABELS[tag].en}
            </Badge>
          ))}
          {model.beginnerFriendly ? (
            <Badge variant="secondary">
              {zh ? "新手推荐" : "Beginner friendly"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <ul className="space-y-1">
          <li>
            {zh ? "推荐 Endpoint" : "Recommended endpoint"}:{" "}
            <code className="text-foreground">
              {zh ? endpoint.zh : endpoint.en}
            </code>
          </li>
          <li>
            {zh ? "适合场景" : "Best for"}:{" "}
            <span className="text-foreground">
              {zh ? suitability.zh : suitability.en}
            </span>
          </li>
          <li>
            Chat Completions:{" "}
            <span className="text-foreground">
              {model.supportsChatCompletions
                ? zh
                  ? "支持"
                  : "Yes"
                : zh
                  ? "不支持"
                  : "No"}
            </span>
          </li>
          <li>
            Responses:{" "}
            <span className="text-foreground">
              {model.supportsResponses
                ? zh
                  ? "支持"
                  : "Yes"
                : zh
                  ? "不支持"
                  : "No"}
            </span>
          </li>
          <li>
            Stream:{" "}
            <span className="text-foreground">
              {model.supportsStream
                ? zh
                  ? "支持"
                  : "Yes"
                : zh
                  ? "不支持"
                  : "No"}
            </span>
          </li>
          <li>
            {zh ? "图片输入" : "Image input"}:{" "}
            <span className="text-foreground">
              {model.supportsImageInput
                ? zh
                  ? "支持"
                  : "Yes"
                : zh
                  ? "不支持"
                  : "No"}
            </span>
          </li>
          <li>
            {zh ? "归属" : "Owned by"}:{" "}
            <code className="text-foreground">tokfai</code>
          </li>
          {model.routesTo ? (
            <li>
              {zh ? "路由到" : "Routes to"}:{" "}
              <code className="text-foreground">{model.routesTo}</code>
            </li>
          ) : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing">{zh ? "查看定价" : "View pricing"}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={docAnchorForModel(model)}>
              {zh ? "查看接入示例" : "View integration example"}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
