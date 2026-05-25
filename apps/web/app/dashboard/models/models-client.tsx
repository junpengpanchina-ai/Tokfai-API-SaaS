"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ImageIcon, MessageSquare, Terminal, Video } from "lucide-react";

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
  CHAT_MODELS,
  IMAGE_MODELS,
  type ModelCatalogEntry,
  type ModelType,
  VIDEO_MODELS,
} from "@/lib/model-catalog";
import { TOKFAI_MODELS_ENDPOINT } from "@/lib/tokfai-api";

const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  chat: "Chat",
  image: "Image",
  video: "Video",
};

export function ModelsClient() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Models</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse Tokfai model IDs, types, and availability. Use these IDs in
            your API requests or the Chat / Image Playgrounds.
          </p>
        </div>
        <Badge variant="secondary">{TOKFAI_MODELS_ENDPOINT}</Badge>
      </div>

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Billing &amp; playgrounds</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Failed calls are not charged.</li>
            <li>Chat Playground only supports chat models.</li>
            <li>Image Playground only supports image models.</li>
            <li>Video models will use a separate playground later.</li>
          </ul>
        </CardContent>
      </Card>

      <ModelSection
        title="Chat Models"
        description="Verified chat models available through the API and Chat Playground."
        icon={MessageSquare}
        models={CHAT_MODELS}
      />

      <ModelSection
        title="Image Models"
        description="Image generation models available through the API and Image Playground."
        icon={ImageIcon}
        models={IMAGE_MODELS.filter((model) => model.id !== "gpt-image-2-vip")}
      />

      <ModelSection
        title="Image Models (coming soon)"
        description="Additional image models planned for future release."
        icon={ImageIcon}
        models={IMAGE_MODELS.filter((model) => model.id === "gpt-image-2-vip")}
        comingSoon
      />

      <ModelSection
        title="Video Models"
        description="Coming soon — video generation models planned for a dedicated Video Playground."
        icon={Video}
        models={VIDEO_MODELS}
        comingSoon
      />
    </div>
  );
}

function ModelSection({
  title,
  description,
  icon: Icon,
  models,
  comingSoon = false,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  models: ModelCatalogEntry[];
  comingSoon?: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {comingSoon ? <Badge variant="warning">Coming soon</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {models.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
      </div>
    </section>
  );
}

function ModelCard({ model }: { model: ModelCatalogEntry }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  async function handleCopyModelId() {
    try {
      await navigator.clipboard.writeText(model.id);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("idle");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{model.displayName}</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs">
              {model.id}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{MODEL_TYPE_LABELS[model.type]}</Badge>
            <StatusBadge status={model.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Billing unit
            </dt>
            <dd>{model.billingUnit}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Description
            </dt>
            <dd className="text-muted-foreground">{model.description}</dd>
          </div>
          {model.supports && model.supports.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                Supports
              </dt>
              <dd>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {model.supports.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleCopyModelId}>
            {copyStatus === "copied" ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy model id
              </>
            )}
          </Button>

          {model.type === "chat" && model.status === "available" ? (
            <Button asChild size="sm">
              <Link href={`/dashboard/playground?model=${encodeURIComponent(model.id)}`}>
                <Terminal className="h-4 w-4" />
                Try in Chat Playground
              </Link>
            </Button>
          ) : model.type === "image" && model.status === "available" ? (
            <Button asChild size="sm">
              <Link
                href={`/dashboard/image-playground?model=${encodeURIComponent(model.id)}`}
              >
                <ImageIcon className="h-4 w-4" />
                Try in Image Playground
              </Link>
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" disabled>
              {model.type === "video" ? (
                <>
                  <Video className="h-4 w-4" />
                  Video Playground coming soon
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  Coming soon
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ModelCatalogEntry["status"] }) {
  if (status === "available") {
    return <Badge variant="success">Available</Badge>;
  }
  return <Badge variant="warning">Coming soon</Badge>;
}
