"use client";

import Link from "next/link";
import { BookOpen, KeyRound, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DashboardCopyButton,
  useDashboardCopyToClipboard,
} from "@/lib/dashboard-safe/copy-block";
import { chatCurlOneLineSafe } from "@/lib/dashboard-safe/curl-one-line";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_SMART_MODEL_ALIASES,
} from "@/lib/dashboard-safe/constants";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

const CURSOR_SNIPPET = `Provider type: OpenAI compatible / Custom OpenAI
Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${TOKFAI_API_KEY_PLACEHOLDER}
Model: auto-fast
Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}`;

/**
 * P979 — minimal first-run acceptance surface (no heavy workbench).
 * Covers Base URL, API Key link, recommended models, curl, Cursor, billing, request_id.
 */
export function DashboardFirstRunAcceptancePanel() {
  const { t } = useDashboardLabels();
  const { copiedId, copyText } = useDashboardCopyToClipboard();
  const curl = chatCurlOneLineSafe();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.firstRunAcceptance.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.firstRunAcceptance.desc")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.firstRunAcceptance.connectTitle")}
          </CardTitle>
          <CardDescription>
            {t("dashboard.firstRunAcceptance.connectDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Base URL
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="font-mono text-sm">{TOKFAI_API_BASE_URL}</code>
              <DashboardCopyButton
                copied={copiedId === "p979-base-url"}
                onCopy={() => copyText("p979-base-url", TOKFAI_API_BASE_URL)}
                copyLabel={t("dashboard.firstRunAcceptance.copy")}
                copiedLabel={t("dashboard.firstRunAcceptance.copied")}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("dashboard.firstRunAcceptance.recommendedModels")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {TOKFAI_SMART_MODEL_ALIASES.map((model) => (
                <li key={model}>
                  <code className="rounded-md border bg-background px-2 py-1 font-mono text-xs">
                    {model}
                  </code>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("dashboard.firstRunAcceptance.recommendedModelsHint")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/dashboard/api-keys#create-api-key">
                <KeyRound className="h-4 w-4" />
                {t("dashboard.firstRunAcceptance.createApiKey")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#quickstart">
                <Terminal className="h-4 w-4" />
                {t("dashboard.firstRunAcceptance.openQuickstart")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#cursor">
                <BookOpen className="h-4 w-4" />
                {t("dashboard.firstRunAcceptance.openCursor")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/usage">
                {t("dashboard.firstRunAcceptance.openUsage")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.firstRunAcceptance.curlTitle")}
          </CardTitle>
          <CardDescription>
            {t("dashboard.firstRunAcceptance.curlDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="max-h-40 overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {curl}
          </pre>
          <DashboardCopyButton
            copied={copiedId === "p979-curl"}
            onCopy={() => copyText("p979-curl", curl)}
            copyLabel={t("dashboard.firstRunAcceptance.copyCurl")}
            copiedLabel={t("dashboard.firstRunAcceptance.copied")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.firstRunAcceptance.cursorTitle")}
          </CardTitle>
          <CardDescription>
            {t("dashboard.firstRunAcceptance.cursorDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="max-h-48 overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">
            {CURSOR_SNIPPET}
          </pre>
          <DashboardCopyButton
            copied={copiedId === "p979-cursor"}
            onCopy={() => copyText("p979-cursor", CURSOR_SNIPPET)}
            copyLabel={t("dashboard.firstRunAcceptance.copyCursor")}
            copiedLabel={t("dashboard.firstRunAcceptance.copied")}
          />
        </CardContent>
      </Card>

      <Card className="border-muted bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.firstRunAcceptance.billingTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t("dashboard.firstRunAcceptance.billingSuccess")}</li>
            <li>{t("dashboard.firstRunAcceptance.billingFail")}</li>
            <li>{t("dashboard.firstRunAcceptance.billingRequestId")}</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#billing">
                {t("dashboard.firstRunAcceptance.openBilling")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#error-codes">
                {t("dashboard.firstRunAcceptance.openErrors")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
