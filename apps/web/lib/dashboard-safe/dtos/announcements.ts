/** Plain JSON DTOs for dashboard announcements client islands. */

export type AnnouncementType =
  | "notice"
  | "maintenance"
  | "billing"
  | "model"
  | "promotion"
  | "docs";

export type PublicAnnouncement = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string;
  type: AnnouncementType;
  priority: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export function announcementTypeLabelKey(type: string): string {
  return `dashboard.announcements.types.${type}`;
}

export function announcementDetailHref(slug: string | null): string | null {
  if (!slug?.trim()) return null;
  return `/dashboard/announcements/${encodeURIComponent(slug.trim())}`;
}
