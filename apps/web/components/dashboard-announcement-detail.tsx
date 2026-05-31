"use client";

import Link from "next/link";
import { ArrowLeft, Pin } from "lucide-react";

import { AnnouncementContent } from "@/components/announcement-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { announcementTypeLabelKey } from "@/lib/announcements";
import type { PublicAnnouncement } from "@/lib/announcements";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function DashboardAnnouncementDetail({
  announcement,
}: {
  announcement: PublicAnnouncement;
}) {
  const { t } = useI18n();
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
          {formatDateTime(announcement.updated_at)}
        </p>
      </div>

      <AnnouncementContent content={announcement.content} />
    </div>
  );
}
