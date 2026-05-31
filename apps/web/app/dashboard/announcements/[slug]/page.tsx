import { notFound } from "next/navigation";

import { DashboardAnnouncementDetail } from "@/components/dashboard-announcement-detail";
import { getPublicAnnouncementBySlug } from "@/lib/dmit/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const announcement = await getPublicAnnouncementBySlug(slug);
  return {
    title: announcement?.title ?? "Announcement",
  };
}

export default async function DashboardAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const announcement = await getPublicAnnouncementBySlug(slug);

  if (!announcement) {
    notFound();
  }

  return <DashboardAnnouncementDetail announcement={announcement} />;
}
