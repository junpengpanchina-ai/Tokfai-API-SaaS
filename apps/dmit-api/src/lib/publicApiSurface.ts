/** Customer-facing API routes advertised on GET /v1/status (no secrets). */
export const PUBLIC_SUPPORTED_ENDPOINTS = [
  "GET /v1/models",
  "POST /v1/chat/completions",
  "POST /v1/responses",
  "GET /v1beta/models",
  "POST /v1beta/models/:model:generateContent",
  "POST /v1beta/models/:model:streamGenerateContent",
  "POST /v1/images/generations",
  "POST /v1/batches/chat",
] as const;

export const DMIT_API_PACKAGE_VERSION = "0.1.0";
