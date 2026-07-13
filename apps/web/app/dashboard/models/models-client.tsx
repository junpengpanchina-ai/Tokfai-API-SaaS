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

function docAnchorForModel(model: ConsumerModelCard): string {
  if (model.kind === "image") return "/docs#image-api";
  if (model.id.startsWith("gemini")) return "/docs#gemini-native";
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
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {zh ? model.displayName.zh : model.displayName.en}
            </CardTitle>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {model.id}
            </p>
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
