"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";

function StatSkeleton() {
  return (
    <div className="rounded-lg border px-4 py-5">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function UsageLoadingClient() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StatSkeleton key={index} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.usage.loadingRecentRequests")}</CardTitle>
          <CardDescription>
            {t("dashboard.usage.loadingRecentRequestsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <th key={index} className="py-2 pr-3 font-medium">
                      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b last:border-0">
                    {Array.from({ length: 9 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="py-3 pr-3">
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
