"use client";

import Link from "next/link";
import { Pin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { dashboardFormatDateTime } from "@/lib/dashboard-safe/display-helpers";
import { normalizePublicAnnouncements } from "@/lib/dashboard-safe/normalize-dashboard-data";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

export function DashboardAnnouncementsList({
  announcements,
}: {
  announcements: PublicAnnouncement[] | unknown;
}) {
  const { t } = useDashboardLabels();
  const items = normalizePublicAnnouncements(announcements);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("dashboard.announcements.announcements")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("dashboard.announcements.subtitle")}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("dashboard.announcements.noAnnouncements")}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item, index) => {
            const href = announcementDetailHref(item.slug);
            const typeKey = announcementTypeLabelKey(item.type);
            const itemKey = item.id || `announcement-${index}`;
            const card = (
              <Card className="transition-colors hover:bg-muted/30">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.pinned ? (
                      <Pin className="h-4 w-4 text-primary" aria-hidden />
                    ) : null}
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <Badge variant="secondary">{t(typeKey)}</Badge>
                  </div>
                  {item.summary ? (
                    <CardDescription>{item.summary}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {dashboardFormatDateTime(item.updated_at)}
                </CardContent>
              </Card>
            );

            if (!href) {
              return <div key={itemKey}>{card}</div>;
            }

            return (
              <Link key={itemKey} href={href} className="block">
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
