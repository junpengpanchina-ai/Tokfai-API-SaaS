"use client";

import Link from "next/link";
import { ArrowUpRight, Megaphone, Pin } from "lucide-react";

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
  announcementDetailHref,
  announcementTypeLabelKey,
  type PublicAnnouncement,
} from "@/lib/dashboard-safe/dtos/announcements";
import { normalizePublicAnnouncements } from "@/lib/dashboard-safe/normalize-dashboard-data";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

export function DashboardAnnouncementsOverview({
  announcements,
}: {
  announcements: PublicAnnouncement[] | unknown;
}) {
  const { t } = useDashboardLabels();
  const items = normalizePublicAnnouncements(announcements);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            {t("dashboard.announcements.latestAnnouncements")}
          </CardTitle>
          <CardDescription>{t("dashboard.announcements.subtitle")}</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link href="/dashboard/announcements" prefetch={false}>
            {t("dashboard.announcements.viewAll")}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.announcements.noAnnouncements")}
          </p>
        ) : (
          items.map((item, index) => {
            const href = announcementDetailHref(item.slug);
            const typeKey = announcementTypeLabelKey(item.type);
            const itemKey = item.id || `announcement-${index}`;
            const inner = (
              <div className="flex flex-col gap-1 rounded-md border p-4 transition-colors hover:bg-muted/40">
                <div className="flex flex-wrap items-center gap-2">
                  {item.pinned ? (
                    <Pin className="h-3.5 w-3.5 text-primary" aria-hidden />
                  ) : null}
                  <span className="text-sm font-medium">{item.title}</span>
                  <Badge variant="secondary" className="text-xs">
                    {t(typeKey)}
                  </Badge>
                </div>
                {item.summary ? (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.summary}
                  </p>
                ) : null}
              </div>
            );

            if (!href) {
              return <div key={itemKey}>{inner}</div>;
            }

            return (
              <Link key={itemKey} href={href} prefetch={false} className="block">
                {inner}
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
