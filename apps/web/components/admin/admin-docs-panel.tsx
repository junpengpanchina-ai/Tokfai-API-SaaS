"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PUBLIC_BETA_DOCS,
  type PublicBetaDoc,
} from "@/lib/docs/public-beta-docs-registry";
import { useI18n } from "@/lib/i18n/i18n-provider";

function pickMarkdown(doc: PublicBetaDoc, locale: string): string {
  return locale === "zh" ? doc.markdown.zh : doc.markdown.en;
}

function pickTitle(doc: PublicBetaDoc, locale: string): string {
  return locale === "zh" ? doc.title.zh : doc.title.en;
}

export function AdminDocsPanel() {
  const { t, locale } = useI18n();
  const docs = PUBLIC_BETA_DOCS;
  const [selectedSlug, setSelectedSlug] = useState(docs[0]?.slug ?? "");
  const selected = useMemo(
    () => docs.find((doc) => doc.slug === selectedSlug) ?? docs[0] ?? null,
    [docs, selectedSlug]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.docs.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.docs.subtitle")}
        </p>
      </div>

      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-muted-foreground">
        {t("admin.docs.configPublishedNotice")}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("admin.docs.listTitle")}</CardTitle>
            <CardDescription>{t("admin.docs.listDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {docs.map((doc) => {
              const active = doc.slug === selected?.slug;
              return (
                <button
                  key={doc.slug}
                  type="button"
                  onClick={() => setSelectedSlug(doc.slug)}
                  className={`flex w-full flex-col rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <span className="font-medium">{pickTitle(doc, locale)}</span>
                  <span className="mt-0.5 font-mono text-[11px] opacity-80">
                    {doc.slug}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {pickTitle(selected, locale)}
                </CardTitle>
                <Badge variant="outline">{selected.audience}</Badge>
                <Badge variant="secondary">{selected.category}</Badge>
              </div>
              <CardDescription>
                {t("admin.docs.updatedAt")}: {selected.updatedAt}
              </CardDescription>
              {selected.apiPaths.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.apiPaths.map((path) => (
                    <code
                      key={path}
                      className="rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      {path}
                    </code>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("admin.docs.noApiPath")}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-4 text-sm leading-relaxed">
                {pickMarkdown(selected, locale)}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
