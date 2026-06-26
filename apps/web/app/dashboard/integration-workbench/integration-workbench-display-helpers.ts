import { readQuickStartApiKeySecret } from "@/lib/customer-quick-start-key-session";
import { isFullTokfaiApiKey, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export { formatMessage as formatWorkbenchMessage } from "@/lib/i18n/format-message";

/** Resolve API key for workbench curls without pulling customer-quick-start-snippets. */
export function resolveWorkbenchApiKey(explicit?: string | null): string {
  if (explicit && isFullTokfaiApiKey(explicit)) return explicit;
  const fromSession = readQuickStartApiKeySecret();
  if (fromSession && isFullTokfaiApiKey(fromSession)) return fromSession;
  return TOKFAI_API_KEY_PLACEHOLDER;
}
