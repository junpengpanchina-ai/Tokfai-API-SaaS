import { env } from "../env.js";

export type AdminChannelRow = {
  id: string;
  provider_name: string;
  base_url: string;
  status: "active" | "disabled";
  priority: number;
  weight: number;
  timeout_ms: number | null;
  success_rate: number | null;
  last_error: string | null;
  enabled: boolean;
  modalities: Array<"chat" | "image">;
};

/** Read-only channel view derived from configured upstream (GRSAI). */
export function listAdminChannels(): AdminChannelRow[] {
  return [
    {
      id: "grsai-primary",
      provider_name: "GRSAI",
      base_url: env.GRSAI_BASE_URL,
      status: "active",
      priority: 1,
      weight: 100,
      timeout_ms: env.IMAGE_REQUEST_TIMEOUT_MS ?? env.GRSAI_CHAT_TIMEOUT_MS ?? null,
      success_rate: null,
      last_error: null,
      enabled: true,
      modalities: ["chat", "image"],
    },
  ];
}
