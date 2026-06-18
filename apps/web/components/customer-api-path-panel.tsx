"use client";

import Link from "next/link";
import { Layers, MessageSquare, Package } from "lucide-react";

import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_API_PATHS,
  buildApiPathCurlOneLine,
  buildApiPathCurlPowerShellOneLine,
  type CustomerApiPathId,
} from "@/lib/customer-api-path";
import { useI18n } from "@/lib/i18n/i18n-provider";

const PATH_ICONS: Record<CustomerApiPathId, typeof MessageSquare> = {
  chat: MessageSquare,
  image: Layers,
  batch: Package,
};

type CustomerApiPathPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showTitle?: boolean;
};

export function CustomerApiPathPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "customer-api-path",
  showTitle = true,
}: CustomerApiPathPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      {showTitle ? (
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("integration.apiPath.chooseTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.apiPath.chooseNote")}
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {CUSTOMER_API_PATHS.map((path) => {
          const Icon = PATH_ICONS[path.id];
          return (
            <div
              key={path.id}
              className="rounded-lg border-2 border-primary/20 bg-background/80 p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                {t(path.titleKey)}
              </p>
              <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
                <div>
                  <dt className="font-medium text-foreground">{t("integration.apiPath.colEndpoint")}</dt>
                  <dd className="mt-0.5 font-mono text-[11px]">{t(path.endpointKey)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">{t("integration.apiPath.colConcurrency")}</dt>
                  <dd className="mt-0.5">{t(path.concurrencyKey)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">{t("integration.apiPath.colSync")}</dt>
                  <dd className="mt-0.5">{t(path.syncKey)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">{t("integration.apiPath.colPolling")}</dt>
                  <dd className="mt-0.5">{t(path.pollingKey)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">{t("integration.apiPath.colOnline500")}</dt>
                  <dd className="mt-0.5">{t(path.online500Key)}</dd>
                </div>
              </dl>
              <OneLineCurlCopyFields
                apiKey={apiKey}
                bashLabel={t("integration.apiPath.copyCurlLabel")}
                bashCurl={buildApiPathCurlOneLine(path.id, apiKey)}
                powershellCurl={buildApiPathCurlPowerShellOneLine(path.id, apiKey)}
                copiedId={copiedId}
                onCopy={onCopy}
                idPrefix={`${idPrefix}-${path.id}`}
                className="mt-3"
              />
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={`/dashboard/docs#${path.docsHash}`}>
                  {t("integration.apiPath.openGuide")}
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
