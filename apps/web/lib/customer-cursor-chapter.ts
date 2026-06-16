import { authorizationHeader } from "@/lib/customer-integration-snippets";
import { TOKFAI_API_BASE_URL, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export const CURSOR_PROVIDER_TYPE = "OpenAI compatible / OpenAI-style";
export const CURSOR_DEFAULT_MODEL = "auto-fast";

export type CursorCopyField = {
  id: string;
  labelKey: string;
  value: string;
};

export function buildCursorConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `Provider type: ${CURSOR_PROVIDER_TYPE}
Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${apiKey}
Model: ${CURSOR_DEFAULT_MODEL}
Authorization: Bearer ${apiKey}`;
}

export function buildCursorCopyFields(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): CursorCopyField[] {
  return [
    {
      id: "provider",
      labelKey: "integration.cursorProviderTypeLabel",
      value: CURSOR_PROVIDER_TYPE,
    },
    {
      id: "base",
      labelKey: "integration.cursorBaseUrlLabel",
      value: TOKFAI_API_BASE_URL,
    },
    {
      id: "key",
      labelKey: "integration.cursorApiKeyLabel",
      value: apiKey,
    },
    {
      id: "model",
      labelKey: "integration.cursorModelLabel",
      value: CURSOR_DEFAULT_MODEL,
    },
    {
      id: "auth",
      labelKey: "integration.cursorAuthorizationLabel",
      value: authorizationHeader(apiKey),
    },
  ];
}
