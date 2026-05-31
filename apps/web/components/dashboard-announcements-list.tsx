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
} from "@/lib/announcements";
import type { PublicAnnouncement } from "@/lib/announcements";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function DashboardAnnouncementsList({
  announcements,
}: {
  announcements: PublicAnnouncement[];
}) {
  const { t } = useI18n();

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

      {announcements.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("dashboard.announcements.noAnnouncements")}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {announcements.map((item) => {
            const href = announcementDetailHref(item.slug);
            const typeKey = announcementTypeLabelKey(item.type);
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
                  {formatDateTime(item.updated_at)}
                </CardContent>
              </Card>
            );

            if (!href) {
              return <div key={item.id}>{card}</div>;
            }

            return (
              <Link key={item.id} href={href} className="block">
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
