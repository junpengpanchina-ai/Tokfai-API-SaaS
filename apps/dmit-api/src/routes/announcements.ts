import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";

export const ANNOUNCEMENT_TYPES = [
  "notice",
  "maintenance",
  "billing",
  "model",
  "promotion",
  "docs",
] as const;

export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export type AnnouncementRow = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string;
  type: string;
  priority: number | string;
  enabled: boolean;
  pinned: boolean;
  visible_from: string | null;
  visible_until: string | null;
  created_at: string;
  updated_at: string;
};

export type AnnouncementListItem = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string;
  type: AnnouncementType;
  priority: number;
  enabled: boolean;
  pinned: boolean;
  visible_from: string | null;
  visible_until: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicAnnouncementListItem = Omit<
  AnnouncementListItem,
  "enabled" | "visible_from" | "visible_until"
>;

const PUBLIC_LIST_COLUMNS =
  "id, title, slug, summary, content, type, priority, pinned, created_at, updated_at";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeType(value: string): AnnouncementType {
  if ((ANNOUNCEMENT_TYPES as readonly string[]).includes(value)) {
    return value as AnnouncementType;
  }
  return "notice";
}

export function mapAnnouncementRow(row: AnnouncementRow): AnnouncementListItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug?.trim() || null,
    summary: row.summary?.trim() || null,
    content: row.content,
    type: normalizeType(row.type),
    priority: toNumber(row.priority),
    enabled: row.enabled,
    pinned: row.pinned,
    visible_from: row.visible_from,
    visible_until: row.visible_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPublicListItem(
  row: AnnouncementListItem
): PublicAnnouncementListItem {
  const { enabled: _enabled, visible_from: _from, visible_until: _until, ...rest } =
    row;
  return rest;
}

export function parseAnnouncementLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function isCurrentlyVisible(row: AnnouncementRow, nowMs: number): boolean {
  if (!row.enabled) return false;
  if (row.visible_from) {
    const fromMs = Date.parse(row.visible_from);
    if (Number.isFinite(fromMs) && fromMs > nowMs) return false;
  }
  if (row.visible_until) {
    const untilMs = Date.parse(row.visible_until);
    if (Number.isFinite(untilMs) && untilMs < nowMs) return false;
  }
  return true;
}

async function fetchVisibleAnnouncements(): Promise<AnnouncementRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from("announcements")
    .select(
      "id, title, slug, summary, content, type, priority, enabled, pinned, visible_from, visible_until, created_at, updated_at"
    )
    .eq("enabled", true)
    .or(`visible_from.is.null,visible_from.lte.${now}`)
    .or(`visible_until.is.null,visible_until.gte.${now}`)
    .order("pinned", { ascending: false })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw ApiError.internal(
      `Failed to list announcements: ${error.message}`,
      "announcements_list_failed"
    );
  }

  const nowMs = Date.now();
  return ((data ?? []) as AnnouncementRow[]).filter((row) =>
    isCurrentlyVisible(row, nowMs)
  );
}

export async function listPublicAnnouncements(
  limit: number
): Promise<PublicAnnouncementListItem[]> {
  const rows = await fetchVisibleAnnouncements();
  return rows
    .slice(0, limit)
    .map((row) => mapAnnouncementRow(row))
    .map(toPublicListItem);
}

export async function getPublicAnnouncementBySlug(
  slug: string
): Promise<PublicAnnouncementListItem | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase()
    .from("announcements")
    .select(
      "id, title, slug, summary, content, type, priority, enabled, pinned, visible_from, visible_until, created_at, updated_at"
    )
    .eq("slug", normalized)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to load announcement: ${error.message}`,
      "announcement_load_failed"
    );
  }

  if (!data) return null;
  const row = data as AnnouncementRow;
  if (!isCurrentlyVisible(row, Date.now())) return null;
  return toPublicListItem(mapAnnouncementRow(row));
}

export const announcementRoutes = new Hono();

announcementRoutes.get("/v1/announcements", async (c) => {
  const limit = parseAnnouncementLimit(c.req.query("limit"));
  const data = await listPublicAnnouncements(limit);
  return c.json({ data });
});

announcementRoutes.get("/v1/announcements/:slug", async (c) => {
  const slug = c.req.param("slug");
  const announcement = await getPublicAnnouncementBySlug(slug);

  if (!announcement) {
    return c.json(
      {
        error: {
          message: "Announcement not found.",
          code: "announcement_not_found",
          type: "not_found",
        },
      },
      404
    );
  }

  return c.json({ data: announcement });
});
