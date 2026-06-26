import { readQuickStartApiKeySecret } from "@/lib/customer-quick-start-key-session";
import {
  isFullTokfaiApiKey,
  TOKFAI_API_KEY_PLACEHOLDER,
} from "@/lib/tokfai-api";

export function resolvePayloadBuilderApiKey(explicit?: string | null): string {
  if (explicit && isFullTokfaiApiKey(explicit)) return explicit;
  const fromSession = readQuickStartApiKeySecret();
  if (fromSession && isFullTokfaiApiKey(fromSession)) return fromSession;
  return TOKFAI_API_KEY_PLACEHOLDER;
}

export function isPayloadBuilderKeyPlaceholder(key: string): boolean {
  return key === TOKFAI_API_KEY_PLACEHOLDER;
}
