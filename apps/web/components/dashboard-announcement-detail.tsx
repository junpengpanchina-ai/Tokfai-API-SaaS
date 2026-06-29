"use client";

import Link from "next/link";
import { ArrowLeft, Pin } from "lucide-react";

import { AnnouncementContent } from "@/components/announcement-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  announcementTypeLabelKey,
  type PublicAnnouncement,
} from "@/lib/dashboard-safe/dtos/announcements";
import { dashboardFormatDateTime } from "@/lib/dashboard-safe/display-helpers";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

export function DashboardAnnouncementDetail({
  announcement,
}: {
  announcement: PublicAnnouncement;
}) {
  const { t } = useDashboardLabels();
  const typeKey = announcementTypeLabelKey(announcement.type);

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/dashboard/announcements">
          <ArrowLeft className="h-4 w-4" />
          {t("dashboard.announcements.announcements")}
        </Link>
      </Button>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.pinned ? (
            <Pin className="h-4 w-4 text-primary" aria-hidden />
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight">
            {announcement.title}
          </h1>
          <Badge variant="secondary">{t(typeKey)}</Badge>
        </div>
        {announcement.summary ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {announcement.summary}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {dashboardFormatDateTime(announcement.updated_at)}
        </p>
      </div>

      <AnnouncementContent content={announcement.content} />
    </div>
  );
}
