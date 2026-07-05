import { env } from "../env.js";

export type AdminSettingsView = {
  site_name: string;
  default_signup_credits: number | null;
  api_base_url: string;
  payments_enabled: boolean;
  registration_enabled: boolean;
  maintenance_mode: boolean;
  updated_at: string;
};

/** Read-only admin settings snapshot (no secrets). */
export function getAdminSettings(): AdminSettingsView {
  const apiBase =
    process.env.TOKFAI_PUBLIC_API_BASE?.trim() ||
    process.env.NEXT_PUBLIC_DMIT_API_BASE?.trim() ||
    "https://api.tokfai.com";

  return {
    site_name: "Tokfai",
    default_signup_credits: null,
    api_base_url: apiBase.replace(/\/+$/, ""),
    payments_enabled: Boolean(env.STRIPE_SECRET_KEY?.trim()),
    registration_enabled: true,
    maintenance_mode: false,
    updated_at: new Date().toISOString(),
  };
}
