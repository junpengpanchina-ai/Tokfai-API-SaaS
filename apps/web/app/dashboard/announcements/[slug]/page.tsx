import { notFound } from "next/navigation";

import { DashboardAnnouncementDetail } from "@/components/dashboard-announcement-detail";
import { rethrowIfNextNavigation } from "@/lib/dashboard-safe/server-session";
import { getPublicAnnouncementBySlug } from "@/lib/dmit/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  try {
    const announcement = await getPublicAnnouncementBySlug(params.slug);
    return {
      title: announcement?.title ?? "Announcement",
    };
  } catch (err) {
    console.error("[dashboard-ssr-fail-open]", "announcements/metadata", err);
    return { title: "Announcement" };
  }
}

export default async function DashboardAnnouncementDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  try {
    const announcement = await getPublicAnnouncementBySlug(params.slug);

    if (!announcement) {
      notFound();
    }

    return <DashboardAnnouncementDetail announcement={announcement} />;
  } catch (err) {
    rethrowIfNextNavigation(err);
    console.error("[dashboard-ssr-fail-open]", "announcements/detail", err);
    notFound();
  }
}
