import { authorizationHeader } from "@/lib/customer-integration-snippets";
import { TOKFAI_API_BASE_URL, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export const CHERRY_PROVIDER_NAME = "Tokfai";
export const CHERRY_PROVIDER_TYPE =
  "OpenAI compatible / OpenAI-style / Custom OpenAI";
export const CHERRY_DEFAULT_MODEL = "auto-fast";
export const CHERRY_STREAM_FIELD_VALUE =
  "Client default; disable stream if the test fails";

export type CherryCopyField = {
  id: string;
  labelKey: string;
  value: string;
};

export function buildCherryConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `Provider name: ${CHERRY_PROVIDER_NAME}
Provider type: ${CHERRY_PROVIDER_TYPE}
Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${apiKey}
Model: ${CHERRY_DEFAULT_MODEL}
Authorization: Bearer ${apiKey}
Stream: ${CHERRY_STREAM_FIELD_VALUE}`;
}

export function buildCherryCopyFields(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): CherryCopyField[] {
  return [
    {
      id: "name",
      labelKey: "integration.cherryProviderNameLabel",
      value: CHERRY_PROVIDER_NAME,
    },
    {
      id: "type",
      labelKey: "integration.cherryProviderTypeLabel",
      value: CHERRY_PROVIDER_TYPE,
    },
    {
      id: "base",
      labelKey: "integration.cherryBaseUrlLabel",
      value: TOKFAI_API_BASE_URL,
    },
    {
      id: "key",
      labelKey: "integration.cherryApiKeyLabel",
      value: apiKey,
    },
    {
      id: "model",
      labelKey: "integration.cherryModelLabel",
      value: CHERRY_DEFAULT_MODEL,
    },
    {
      id: "auth",
      labelKey: "integration.cherryAuthorizationLabel",
      value: authorizationHeader(apiKey),
    },
    {
      id: "stream",
      labelKey: "integration.cherryStreamLabel",
      value: CHERRY_STREAM_FIELD_VALUE,
    },
  ];
}
