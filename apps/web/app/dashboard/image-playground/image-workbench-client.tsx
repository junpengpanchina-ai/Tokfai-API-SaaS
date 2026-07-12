"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ImageGeneratePanel,
  type ImagePlaygroundApiKeyOption,
} from "./image-playground-client";
import { EcommerceVisionTab } from "./ecommerce-vision-tab";
import { useImagePlaygroundLabels } from "./use-image-playground-labels";

type WorkbenchTab = "analysis" | "copy" | "generate";

export function ImagePlaygroundClient({
  accessToken,
  activeKeys,
  initialModel,
  initialCreditsBalance = null,
  creditsLoaded = false,
}: {
  accessToken: string;
  activeKeys: ImagePlaygroundApiKeyOption[];
  initialModel?: string;
  initialCreditsBalance?: number | null;
  creditsLoaded?: boolean;
}) {
  const { t } = useImagePlaygroundLabels();
  const [tab, setTab] = useState<WorkbenchTab>("analysis");

  const tabs: Array<{ id: WorkbenchTab; labelKey: string }> = [
    { id: "analysis", labelKey: "dashboard.imageWorkbench.tabAnalysis" },
    { id: "copy", labelKey: "dashboard.imageWorkbench.tabCopy" },
    { id: "generate", labelKey: "dashboard.imageWorkbench.tabGenerate" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.imageWorkbench.title")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("dashboard.imageWorkbench.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={tab === item.id ? "default" : "outline"}
            onClick={() => setTab(item.id)}
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </div>

      {tab === "analysis" ? (
        <EcommerceVisionTab
          mode="ecommerce_image_analysis"
          accessToken={accessToken}
          activeKeys={activeKeys}
          initialCreditsBalance={initialCreditsBalance}
          creditsLoaded={creditsLoaded}
        />
      ) : null}

      {tab === "copy" ? (
        <EcommerceVisionTab
          mode="product_copy"
          accessToken={accessToken}
          activeKeys={activeKeys}
          initialCreditsBalance={initialCreditsBalance}
          creditsLoaded={creditsLoaded}
        />
      ) : null}

      {tab === "generate" ? (
        <ImageGeneratePanel
          accessToken={accessToken}
          activeKeys={activeKeys}
          initialModel={initialModel}
          initialCreditsBalance={initialCreditsBalance}
          creditsLoaded={creditsLoaded}
        />
      ) : null}
    </div>
  );
}

export type { ImagePlaygroundApiKeyOption };
