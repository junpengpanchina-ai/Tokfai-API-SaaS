import { env } from "../env.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import { log } from "../logger.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";

export type AdminSettingsView = {
  site_name: string;
  default_signup_credits: number | null;
  api_base_url: string;
  payments_enabled: boolean;
  registration_enabled: boolean;
  maintenance_mode: boolean;
  updated_at: string;
};

type AdminSettingsWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
  requestId?: string;
  route?: string;
};

type SettingsOverlay = {
  site_name?: string;
  default_signup_credits?: number | null;
  registration_enabled?: boolean;
  maintenance_mode?: boolean;
  updated_at: string;
};

/** Process-local allowlisted settings overlay (no schema / no secrets). */
let settingsOverlay: SettingsOverlay | null = null;

const ALLOWED_SETTINGS_KEYS = new Set([
  "site_name",
  "default_signup_credits",
  "registration_enabled",
  "maintenance_mode",
]);

function resolveApiBaseUrl(): string {
  const apiBase =
    process.env.TOKFAI_PUBLIC_API_BASE?.trim() ||
    process.env.NEXT_PUBLIC_DMIT_API_BASE?.trim() ||
    "https://api.tokfai.com";
  return apiBase.replace(/\/+$/, "");
}

function baseSettings(): AdminSettingsView {
  return {
    site_name: "Tokfai",
    default_signup_credits: null,
    api_base_url: resolveApiBaseUrl(),
    payments_enabled: Boolean(env.STRIPE_SECRET_KEY?.trim()),
    registration_enabled: true,
    maintenance_mode: false,
    updated_at: new Date().toISOString(),
  };
}

/** Read-only admin settings snapshot (no secrets). */
export function getAdminSettings(): AdminSettingsView {
  const base = baseSettings();
  if (!settingsOverlay) return base;

  return {
    ...base,
    site_name: settingsOverlay.site_name ?? base.site_name,
    default_signup_credits:
      settingsOverlay.default_signup_credits !== undefined
        ? settingsOverlay.default_signup_credits
        : base.default_signup_credits,
    registration_enabled:
      settingsOverlay.registration_enabled ?? base.registration_enabled,
    maintenance_mode:
      settingsOverlay.maintenance_mode ?? base.maintenance_mode,
    updated_at: settingsOverlay.updated_at,
  };
}

async function auditSettingsWrite(
  ctx: AdminSettingsWriteContext,
  args: {
    action: string;
    requestPayload: Record<string, unknown>;
    status: "succeeded" | "failed";
    error?: string | null;
    settings?: AdminSettingsView | null;
  }
): Promise<void> {
  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: args.action,
    resourceType: "settings",
    resourceId: "global",
    requestPayload: args.requestPayload,
    status: args.status,
    resultPayload: {
      ok: args.status === "succeeded",
      action: args.action,
      error: args.error ?? null,
      settings: args.settings
        ? {
            site_name: args.settings.site_name,
            default_signup_credits: args.settings.default_signup_credits,
            registration_enabled: args.settings.registration_enabled,
            maintenance_mode: args.settings.maintenance_mode,
            updated_at: args.settings.updated_at,
          }
        : null,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey || undefined,
  });
}

/**
 * Patch allowlisted settings only (process-local).
 * Never accepts or returns service role / Stripe / GRSAI secrets.
 */
export async function updateAdminSettings(
  body: Record<string, unknown>,
  ctx: AdminSettingsWriteContext
): Promise<
  | { ok: true; settings: AdminSettingsView }
  | { ok: false; status: 400; error: string; detail?: unknown }
> {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
      await auditSettingsWrite(ctx, {
        action: "settings.patch",
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "unknown_or_disallowed_field",
      });
      return {
        ok: false,
        status: 400,
        error: "unknown_or_disallowed_field",
        detail: { field: key },
      };
    }
  }

  const next: SettingsOverlay = {
    ...(settingsOverlay ?? {}),
    updated_at: new Date().toISOString(),
  };
  let changed = false;

  if (body.site_name !== undefined) {
    if (typeof body.site_name !== "string" || !body.site_name.trim()) {
      await auditSettingsWrite(ctx, {
        action: "settings.patch",
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_site_name",
      });
      return { ok: false, status: 400, error: "invalid_site_name" };
    }
    const name = body.site_name.trim().slice(0, 80);
    next.site_name = name;
    changed = true;
  }

  if (body.default_signup_credits !== undefined) {
    if (body.default_signup_credits === null) {
      next.default_signup_credits = null;
      changed = true;
    } else {
      const credits = Number(body.default_signup_credits);
      if (!Number.isFinite(credits) || credits < 0 || credits > 1_000_000) {
        await auditSettingsWrite(ctx, {
          action: "settings.patch",
          requestPayload: { fields: Object.keys(body) },
          status: "failed",
          error: "invalid_default_signup_credits",
        });
        return {
          ok: false,
          status: 400,
          error: "invalid_default_signup_credits",
        };
      }
      next.default_signup_credits = Math.trunc(credits);
      changed = true;
    }
  }

  if (body.registration_enabled !== undefined) {
    if (typeof body.registration_enabled !== "boolean") {
      await auditSettingsWrite(ctx, {
        action: "settings.patch",
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_registration_enabled",
      });
      return { ok: false, status: 400, error: "invalid_registration_enabled" };
    }
    next.registration_enabled = body.registration_enabled;
    changed = true;
  }

  if (body.maintenance_mode !== undefined) {
    if (typeof body.maintenance_mode !== "boolean") {
      await auditSettingsWrite(ctx, {
        action: "settings.patch",
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_maintenance_mode",
      });
      return { ok: false, status: 400, error: "invalid_maintenance_mode" };
    }
    next.maintenance_mode = body.maintenance_mode;
    changed = true;
  }

  if (!changed) {
    await auditSettingsWrite(ctx, {
      action: "settings.patch",
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "empty_patch",
    });
    return { ok: false, status: 400, error: "empty_patch" };
  }

  settingsOverlay = next;
  const settings = getAdminSettings();

  await auditSettingsWrite(ctx, {
    action: "settings.patch",
    requestPayload: {
      fields: Object.keys(body).filter((k) => ALLOWED_SETTINGS_KEYS.has(k)),
      site_name: next.site_name,
      default_signup_credits: next.default_signup_credits,
      registration_enabled: next.registration_enabled,
      maintenance_mode: next.maintenance_mode,
    },
    status: "succeeded",
    settings,
  });

  log.info("admin_settings_patch_ok", {
    requestId: ctx.requestId,
    route: ctx.route,
    code: "admin_settings_patch_ok",
    message: "Admin settings overlay updated.",
    adminUserId: ctx.adminUser.adminUserId ?? undefined,
  });

  return { ok: true, settings };
}

export function __resetAdminSettingsOverlayForTests(): void {
  settingsOverlay = null;
}
