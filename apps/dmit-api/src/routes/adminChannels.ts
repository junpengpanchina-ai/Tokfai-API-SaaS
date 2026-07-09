import { env } from "../env.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import { log } from "../logger.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";

export type AdminChannelRow = {
  id: string;
  provider_name: string;
  base_url: string;
  base_url_masked: string;
  status: "active" | "disabled";
  priority: number;
  weight: number;
  timeout_ms: number | null;
  success_rate: number | null;
  last_error: string | null;
  enabled: boolean;
  modalities: Array<"chat" | "image">;
  updated_at: string | null;
};

type AdminChannelWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
  requestId?: string;
  route?: string;
};

type ChannelOverlay = {
  enabled?: boolean;
  status?: "active" | "disabled";
  priority?: number;
  weight?: number;
  base_url_override?: string | null;
  updated_at: string;
};

/**
 * Process-local channel overlays (no schema change).
 * Survives within a DMIT process; resets on restart.
 */
const channelOverlays = new Map<string, ChannelOverlay>();

function maskBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    if (host.length <= 6) return `${parsed.protocol}//***`;
    return `${parsed.protocol}//${host.slice(0, 3)}***${host.slice(-3)}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    if (url.length <= 8) return "***";
    return `${url.slice(0, 4)}***${url.slice(-4)}`;
  }
}

function baseChannel(): AdminChannelRow {
  const baseUrl = env.GRSAI_BASE_URL;
  return {
    id: "grsai-primary",
    provider_name: "GRSAI",
    base_url: baseUrl,
    base_url_masked: maskBaseUrl(baseUrl),
    status: "active",
    priority: 1,
    weight: 100,
    timeout_ms: env.IMAGE_REQUEST_TIMEOUT_MS ?? env.GRSAI_CHAT_TIMEOUT_MS ?? null,
    success_rate: null,
    last_error: null,
    enabled: true,
    modalities: ["chat", "image"],
    updated_at: null,
  };
}

function applyOverlay(
  channel: AdminChannelRow,
  overlay: ChannelOverlay | undefined
): AdminChannelRow {
  if (!overlay) {
    return {
      ...channel,
      base_url_masked: maskBaseUrl(channel.base_url),
    };
  }

  const enabled =
    overlay.enabled !== undefined
      ? overlay.enabled
      : overlay.status !== undefined
        ? overlay.status === "active"
        : channel.enabled;

  const status =
    overlay.status ??
    (overlay.enabled !== undefined
      ? overlay.enabled
        ? "active"
        : "disabled"
      : channel.status);

  const effectiveBase =
    overlay.base_url_override?.trim() || channel.base_url;

  return {
    ...channel,
    enabled,
    status,
    priority: overlay.priority ?? channel.priority,
    weight: overlay.weight ?? channel.weight,
    // Admin list keeps effective URL for ops; masked field is always present.
    // Upstream API keys are never included in this payload.
    base_url: effectiveBase,
    base_url_masked: maskBaseUrl(effectiveBase),
    updated_at: overlay.updated_at,
  };
}

/** Read-only channel view derived from configured upstream (GRSAI) + overlays. */
export function listAdminChannels(): AdminChannelRow[] {
  const channel = baseChannel();
  return [applyOverlay(channel, channelOverlays.get(channel.id))];
}

export function getAdminChannel(id: string): AdminChannelRow | null {
  const channel = listAdminChannels().find((row) => row.id === id);
  return channel ?? null;
}

async function auditChannelWrite(
  ctx: AdminChannelWriteContext,
  args: {
    action: string;
    resourceId: string;
    requestPayload: Record<string, unknown>;
    status: "succeeded" | "failed";
    error?: string | null;
    channel?: AdminChannelRow | null;
  }
): Promise<void> {
  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: args.action,
    resourceType: "channel",
    resourceId: args.resourceId,
    requestPayload: args.requestPayload,
    status: args.status,
    resultPayload: {
      ok: args.status === "succeeded",
      channel_id: args.resourceId,
      action: args.action,
      error: args.error ?? null,
      channel: args.channel
        ? {
            id: args.channel.id,
            enabled: args.channel.enabled,
            status: args.channel.status,
            priority: args.channel.priority,
            base_url_masked: args.channel.base_url_masked,
          }
        : null,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey || undefined,
  });
}

const ALLOWED_CHANNEL_PATCH = new Set([
  "enabled",
  "status",
  "priority",
  "weight",
  "base_url",
]);

/**
 * Patch channel operational fields (process-local overlay).
 * base_url is stored but always returned masked — never exposes upstream keys.
 */
export async function updateAdminChannel(
  id: string,
  body: Record<string, unknown>,
  ctx: AdminChannelWriteContext
): Promise<
  | { ok: true; channel: AdminChannelRow }
  | { ok: false; status: 400 | 404; error: string; detail?: unknown }
> {
  const channelId = id.trim();
  if (!channelId) {
    return { ok: false, status: 400, error: "missing_channel_id" };
  }

  const base = baseChannel();
  if (channelId !== base.id) {
    await auditChannelWrite(ctx, {
      action: "channels.patch",
      resourceId: channelId,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "channel_not_found",
    });
    return { ok: false, status: 404, error: "channel_not_found" };
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_CHANNEL_PATCH.has(key)) {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "unknown_field",
      });
      return {
        ok: false,
        status: 400,
        error: "unknown_field",
        detail: { field: key },
      };
    }
  }

  const patch: ChannelOverlay = {
    ...(channelOverlays.get(channelId) ?? {}),
    updated_at: new Date().toISOString(),
  };
  let changed = false;

  if (typeof body.enabled === "boolean") {
    patch.enabled = body.enabled;
    patch.status = body.enabled ? "active" : "disabled";
    changed = true;
  }

  if (body.status === "active" || body.status === "disabled") {
    patch.status = body.status;
    patch.enabled = body.status === "active";
    changed = true;
  }

  if (body.priority !== undefined) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 10_000) {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_priority",
      });
      return { ok: false, status: 400, error: "invalid_priority" };
    }
    patch.priority = priority;
    changed = true;
  }

  if (body.weight !== undefined) {
    const weight = Number(body.weight);
    if (!Number.isInteger(weight) || weight < 0 || weight > 10_000) {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_weight",
      });
      return { ok: false, status: 400, error: "invalid_weight" };
    }
    patch.weight = weight;
    changed = true;
  }

  if (body.base_url !== undefined) {
    if (body.base_url === null || body.base_url === "") {
      patch.base_url_override = null;
      changed = true;
    } else if (typeof body.base_url === "string") {
      const trimmed = body.base_url.trim();
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new Error("invalid protocol");
        }
        patch.base_url_override = parsed.toString().replace(/\/+$/, "");
        changed = true;
      } catch {
        await auditChannelWrite(ctx, {
          action: "channels.patch",
          resourceId: channelId,
          requestPayload: { fields: Object.keys(body) },
          status: "failed",
          error: "invalid_base_url",
        });
        return { ok: false, status: 400, error: "invalid_base_url" };
      }
    } else {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_base_url",
      });
      return { ok: false, status: 400, error: "invalid_base_url" };
    }
  }

  if (!changed) {
    await auditChannelWrite(ctx, {
      action: "channels.patch",
      resourceId: channelId,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "empty_patch",
    });
    return { ok: false, status: 400, error: "empty_patch" };
  }

  channelOverlays.set(channelId, patch);
  const channel = applyOverlay(base, patch);

  await auditChannelWrite(ctx, {
    action: "channels.patch",
    resourceId: channelId,
    requestPayload: {
      fields: Object.keys(body),
      enabled: patch.enabled,
      status: patch.status,
      priority: patch.priority,
      weight: patch.weight,
      base_url_masked: channel.base_url_masked,
    },
    status: "succeeded",
    channel,
  });

  log.info("admin_channel_patch_ok", {
    requestId: ctx.requestId,
    route: ctx.route,
    code: "admin_channel_patch_ok",
    message: "Admin channel overlay updated.",
    adminUserId: ctx.adminUser.adminUserId ?? undefined,
  });

  return { ok: true, channel };
}

/** Test helper — clear overlays (not exported via HTTP). */
export function __resetAdminChannelOverlaysForTests(): void {
  channelOverlays.clear();
}
