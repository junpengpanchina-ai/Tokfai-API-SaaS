import { z } from "zod";

import { ApiError } from "../errors.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";
import {
  ANNOUNCEMENT_TYPES,
  type AnnouncementListItem,
  type AnnouncementRow,
  mapAnnouncementRow,
  parseAnnouncementLimit,
} from "./announcements.js";

const ADMIN_ANNOUNCEMENT_RESOURCE_TYPE = "announcements";

const AnnouncementTypeSchema = z.enum(ANNOUNCEMENT_TYPES);

function emptyToUndefined(value: unknown): unknown {
  if (value === "" || value === undefined) return undefined;
  return value;
}

function normalizeSlugInput(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const optionalTimestampField = z.preprocess(
  emptyToUndefined,
  z.union([z.string().datetime(), z.null()]).optional()
);

const AnnouncementCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z.preprocess(normalizeSlugInput, z.string().min(1).max(120).optional()),
    summary: z.union([z.string().trim().max(500), z.null()]).optional(),
    content: z.string().trim().min(1).max(50_000),
    type: AnnouncementTypeSchema.optional(),
    priority: z.coerce.number().int().min(0).max(1_000_000).optional(),
    enabled: z.boolean().optional(),
    pinned: z.boolean().optional(),
    visible_from: optionalTimestampField,
    visible_until: optionalTimestampField,
  })
  .strict();

const AnnouncementPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    slug: z.preprocess(normalizeSlugInput, z.string().min(1).max(120).optional()),
    summary: z.union([z.string().trim().max(500), z.null()]).optional(),
    content: z.string().trim().min(1).max(50_000).optional(),
    type: AnnouncementTypeSchema.optional(),
    priority: z.coerce.number().int().min(0).max(1_000_000).optional(),
    enabled: z.boolean().optional(),
    pinned: z.boolean().optional(),
    visible_from: optionalTimestampField,
    visible_until: optionalTimestampField,
  })
  .strict();

type AdminAnnouncementWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
};

async function auditAnnouncementWrite(
  ctx: AdminAnnouncementWriteContext,
  args: {
    action: string;
    resourceId: string;
    requestPayload: Record<string, unknown>;
    status: "succeeded" | "failed";
    changedFields?: string[];
    error?: string | null;
    announcement?: AnnouncementListItem | null;
  }
): Promise<void> {
  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: args.action,
    resourceType: ADMIN_ANNOUNCEMENT_RESOURCE_TYPE,
    resourceId: args.resourceId,
    requestPayload: args.requestPayload,
    status: args.status,
    resultPayload: {
      ok: args.status === "succeeded",
      announcement_id: args.resourceId,
      action: args.action,
      changed_fields: args.changedFields ?? [],
      error: args.error ?? null,
      announcement: args.announcement ?? null,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey || undefined,
  });
}

const ADMIN_SELECT_COLUMNS =
  "id, title, slug, summary, content, type, priority, enabled, pinned, visible_from, visible_until, created_at, updated_at";

export async function listAdminAnnouncements(): Promise<AnnouncementListItem[]> {
  const { data, error } = await supabase()
    .from("announcements")
    .select(ADMIN_SELECT_COLUMNS)
    .order("pinned", { ascending: false })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw ApiError.internal(
      `Failed to list announcements: ${error.message}`,
      "announcements_list_failed"
    );
  }

  return ((data ?? []) as AnnouncementRow[]).map(mapAnnouncementRow);
}

export async function createAdminAnnouncement(
  body: Record<string, unknown>,
  ctx: AdminAnnouncementWriteContext
): Promise<
  | { ok: true; announcement: AnnouncementListItem }
  | { ok: false; status: 400 | 409; error: string; detail?: unknown }
> {
  const parsed = AnnouncementCreateSchema.safeParse(body);
  if (!parsed.success) {
    await auditAnnouncementWrite(ctx, {
      action: "announcements.create",
      resourceId: "unknown",
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "invalid_announcement_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_announcement_fields",
      detail: parsed.error.flatten(),
    };
  }

  const input = parsed.data;
  const now = new Date().toISOString();
  const insertPayload: Record<string, unknown> = {
    title: input.title,
    content: input.content,
    type: input.type ?? "notice",
    priority: input.priority ?? 100,
    enabled: input.enabled ?? true,
    pinned: input.pinned ?? false,
    updated_at: now,
  };

  if (input.slug !== undefined) insertPayload.slug = input.slug;
  if (input.summary !== undefined) {
    insertPayload.summary =
      input.summary === null || input.summary === "" ? null : input.summary;
  }
  if (input.visible_from !== undefined) {
    insertPayload.visible_from = input.visible_from;
  }
  if (input.visible_until !== undefined) {
    insertPayload.visible_until = input.visible_until;
  }

  const { data, error } = await supabase()
    .from("announcements")
    .insert(insertPayload)
    .select(ADMIN_SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    const isDuplicate =
      error.code === "23505" ||
      error.message.toLowerCase().includes("duplicate");
    if (isDuplicate) {
      await auditAnnouncementWrite(ctx, {
        action: "announcements.create",
        resourceId: String(input.slug ?? "unknown"),
        requestPayload: body,
        status: "failed",
        error: "announcement_slug_exists",
      });
      return { ok: false, status: 409, error: "announcement_slug_exists" };
    }
    throw ApiError.internal(
      `Failed to create announcement: ${error.message}`,
      "announcement_create_failed"
    );
  }

  if (!data) {
    throw ApiError.internal(
      "Created announcement could not be loaded.",
      "announcement_load_failed"
    );
  }

  const announcement = mapAnnouncementRow(data as AnnouncementRow);
  await auditAnnouncementWrite(ctx, {
    action: "announcements.create",
    resourceId: announcement.id,
    requestPayload: body,
    status: "succeeded",
    announcement,
  });

  return { ok: true, announcement };
}

export async function updateAdminAnnouncement(
  id: string,
  body: Record<string, unknown>,
  ctx: AdminAnnouncementWriteContext
): Promise<
  | { ok: true; announcement: AnnouncementListItem }
  | { ok: false; status: 400 | 404 | 409; error: string; detail?: unknown }
> {
  const announcementId = id.trim();
  if (!announcementId) {
    return { ok: false, status: 400, error: "missing_announcement_id" };
  }

  const parsed = AnnouncementPatchSchema.safeParse(body);
  if (!parsed.success) {
    await auditAnnouncementWrite(ctx, {
      action: "announcements.update",
      resourceId: announcementId,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "invalid_announcement_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_announcement_fields",
      detail: parsed.error.flatten(),
    };
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    await auditAnnouncementWrite(ctx, {
      action: "announcements.update",
      resourceId: announcementId,
      requestPayload: body,
      status: "failed",
      error: "empty_patch",
    });
    return { ok: false, status: 400, error: "empty_patch" };
  }

  const { data: existing, error: existingError } = await supabase()
    .from("announcements")
    .select("id")
    .eq("id", announcementId)
    .maybeSingle();

  if (existingError) {
    throw ApiError.internal(
      `Failed to verify announcement: ${existingError.message}`,
      "announcement_verify_failed"
    );
  }

  if (!existing) {
    await auditAnnouncementWrite(ctx, {
      action: "announcements.update",
      resourceId: announcementId,
      requestPayload: body,
      status: "failed",
      error: "announcement_not_found",
    });
    return { ok: false, status: 404, error: "announcement_not_found" };
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.title !== undefined) updatePayload.title = patch.title;
  if (patch.slug !== undefined) updatePayload.slug = patch.slug;
  if (patch.summary !== undefined) {
    updatePayload.summary =
      patch.summary === null || patch.summary === "" ? null : patch.summary;
  }
  if (patch.content !== undefined) updatePayload.content = patch.content;
  if (patch.type !== undefined) updatePayload.type = patch.type;
  if (patch.priority !== undefined) updatePayload.priority = patch.priority;
  if (patch.enabled !== undefined) updatePayload.enabled = patch.enabled;
  if (patch.pinned !== undefined) updatePayload.pinned = patch.pinned;
  if (patch.visible_from !== undefined) {
    updatePayload.visible_from = patch.visible_from;
  }
  if (patch.visible_until !== undefined) {
    updatePayload.visible_until = patch.visible_until;
  }

  const { error: updateError } = await supabase()
    .from("announcements")
    .update(updatePayload)
    .eq("id", announcementId);

  if (updateError) {
    const isDuplicate =
      updateError.code === "23505" ||
      updateError.message.toLowerCase().includes("duplicate");
    if (isDuplicate) {
      await auditAnnouncementWrite(ctx, {
        action: "announcements.update",
        resourceId: announcementId,
        requestPayload: body,
        status: "failed",
        error: "announcement_slug_exists",
      });
      return { ok: false, status: 409, error: "announcement_slug_exists" };
    }
    throw ApiError.internal(
      `Failed to update announcement: ${updateError.message}`,
      "announcement_update_failed"
    );
  }

  const { data: updated, error: loadError } = await supabase()
    .from("announcements")
    .select(ADMIN_SELECT_COLUMNS)
    .eq("id", announcementId)
    .maybeSingle();

  if (loadError || !updated) {
    throw ApiError.internal(
      "Updated announcement could not be loaded.",
      "announcement_load_failed"
    );
  }

  const announcement = mapAnnouncementRow(updated as AnnouncementRow);
  await auditAnnouncementWrite(ctx, {
    action: "announcements.update",
    resourceId: announcementId,
    requestPayload: body,
    status: "succeeded",
    changedFields: Object.keys(patch),
    announcement,
  });

  return { ok: true, announcement };
}
