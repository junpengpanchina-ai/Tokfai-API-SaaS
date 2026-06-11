"use client";

import Link from "next/link";
import { ArrowRight, ImageIcon, MessageSquare, Plug } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_CHAT_COMPLETIONS_ENDPOINT,
  TOKFAI_IMAGES_GENERATIONS_FULL_PATH,
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";

const SCENARIOS = [
  {
    key: "chat" as const,
    icon: MessageSquare,
    endpoint: TOKFAI_CHAT_COMPLETIONS_ENDPOINT,
    model: TOKFAI_RECOMMENDED_MODEL,
    docsHref: "/docs#chat-completions",
  },
  {
    key: "image" as const,
    icon: ImageIcon,
    endpoint: TOKFAI_IMAGES_GENERATIONS_FULL_PATH,
    model: "nano-banana",
    docsHref: "/docs#image-generations",
  },
  {
    key: "devtools" as const,
    icon: Plug,
    endpoint: TOKFAI_API_BASE_URL,
    model: TOKFAI_RECOMMENDED_MODEL,
    docsHref: "/docs#client-integrations",
  },
];

export function HomeScenarios() {
  const { t } = useI18n();

  return (
    <section className="border-t bg-muted/30">
      <div className="container min-w-0 overflow-x-hidden py-16 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("home.scenariosTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("home.scenariosDesc")}
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
          {SCENARIOS.map((scenario) => {
            const Icon = scenario.icon;
            return (
              <Card key={scenario.key} className="flex min-w-0 flex-col overflow-hidden">
                <CardHeader>
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">
                    {t(`home.scenario${scenario.key === "chat" ? "Chat" : scenario.key === "image" ? "Image" : "DevTools"}Title`)}
                  </CardTitle>
                  <CardDescription>
                    {t(`home.scenario${scenario.key === "chat" ? "Chat" : scenario.key === "image" ? "Image" : "DevTools"}Body`)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-4">
                  <dl className="space-y-2 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <dt className="font-medium text-foreground">
                        {t("home.scenarioEndpointLabel")}
                      </dt>
                      <dd className="font-mono text-xs text-muted-foreground">
                        {scenario.endpoint}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="font-medium text-foreground">
                        {t("home.scenarioModelLabel")}
                      </dt>
                      <dd className="font-mono text-xs text-muted-foreground">
                        {scenario.model}
                      </dd>
                    </div>
                  </dl>
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link href={scenario.docsHref}>
                      {t(`home.scenario${scenario.key === "chat" ? "Chat" : scenario.key === "image" ? "Image" : "DevTools"}Cta`)}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
