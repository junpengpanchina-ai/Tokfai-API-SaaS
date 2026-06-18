"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  API_CONCURRENCY_GUIDANCE,
  CAPACITY_ERROR_RESPONSE_KEYS,
  CAPACITY_INDUSTRY_NOTE_KEYS,
  CAPACITY_LAYERS,
  CAPACITY_READINESS_KEYS,
  ONLINE_USERS_TARGET,
  RECOMMENDED_BATCH_QUEUE,
  RECOMMENDED_IMAGE_CONCURRENCY,
  RECOMMENDED_SYNC_CONCURRENCY,
} from "@/lib/customer-capacity-model";
import { useI18n } from "@/lib/i18n/i18n-provider";

type CapacityModelPanelProps = {
  showReadiness?: boolean;
  idPrefix?: string;
};

export function CapacityModelPanel({
  showReadiness = false,
  idPrefix = "capacity-model",
}: CapacityModelPanelProps) {
  const { t } = useI18n();

  return (
    <div id={idPrefix} className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium text-foreground">{t("integration.capacity.summaryTitle")}</p>
        <p className="mt-2 text-muted-foreground">{t("integration.capacity.summary")}</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-foreground">
              {t("integration.capacity.targetOnlineUsers")}
            </dt>
            <dd className="font-mono text-sm">{ONLINE_USERS_TARGET}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground">
              {t("integration.capacity.targetSyncConcurrency")}
            </dt>
            <dd className="font-mono text-sm">{RECOMMENDED_SYNC_CONCURRENCY.label}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground">
              {t("integration.capacity.targetBatchQueue")}
            </dt>
            <dd className="font-mono text-sm">{RECOMMENDED_BATCH_QUEUE.label}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground">
              {t("integration.capacity.targetImageConcurrency")}
            </dt>
            <dd className="font-mono text-sm">{RECOMMENDED_IMAGE_CONCURRENCY.label}</dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">
          {t("integration.capacity.layersTitle")}
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {CAPACITY_LAYERS.map((layer) => (
            <li key={layer.id} className="rounded-md border bg-background/80 px-3 py-2">
              <p className="font-medium text-foreground">{t(layer.titleKey)}</p>
              <p className="mt-1 text-muted-foreground">{t(layer.descriptionKey)}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">
          {t("integration.capacity.apiTableTitle")}
        </p>
        <div className="mt-2 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 text-left font-medium">
                  {t("integration.capacity.apiColEndpoint")}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t("integration.capacity.apiColConcurrency")}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {t("integration.capacity.apiColBehavior")}
                </th>
              </tr>
            </thead>
            <tbody>
              {API_CONCURRENCY_GUIDANCE.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {t(row.endpointKey)}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {t(row.concurrencyKey)}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {t(row.behaviorKey)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">
          {t("integration.capacity.errorsTitle")}
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {CAPACITY_ERROR_RESPONSE_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">
          {t("integration.capacity.industryTitle")}
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {CAPACITY_INDUSTRY_NOTE_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>

      {showReadiness ? (
        <CapacityReadinessPanel idPrefix={`${idPrefix}-readiness`} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/usage">{t("integration.linkUsage")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/credits">{t("integration.linkCredits")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#batch-api">{t("integration.navBatch")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#service-unavailable">
            {t("integration.navServiceUnavailable")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function CapacityReadinessPanel({ idPrefix = "capacity-readiness" }: { idPrefix?: string }) {
  const { t } = useI18n();

  return (
    <div id={idPrefix} className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-foreground">
        {t("integration.capacity.readinessTitle")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("integration.capacity.readinessDesc")}
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        {CAPACITY_READINESS_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
      <Button asChild size="sm" variant="outline" className="mt-3">
        <Link href="/dashboard/docs#capacity-and-rate-limits">
          {t("integration.capacity.readinessDocsLink")}
        </Link>
      </Button>
    </div>
  );
}
