import { z } from "zod";

/**
 * Server-only env. Validated at boot — if anything is missing or malformed
 * the process exits before listening, so we never serve traffic with a
 * half-configured backend.
 */

const csv = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const Schema = z
  .object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default(
      "https://tokfai.com,https://www.tokfai.com,http://localhost:3000",
    )
    .transform(csv),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_JWT_SECRET: z.string().min(20),
  TOKFAI_ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((raw) => csv(raw).map((email) => email.toLowerCase())),

  TOKEN_PEPPER: z.string().min(32, "TOKEN_PEPPER must be at least 32 chars"),
  TOKFAI_KEY_ENCRYPTION_SECRET: z.string().optional(),

  /**
   * P1095 — Optional AES-256-GCM key for Responses previous_response_id
   * tool-state durable blobs. Missing/short → memory-only fallback (no boot fail).
   */
  RESPONSES_STATE_ENCRYPTION_KEY: z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? undefined : v),
    z.string().min(32).optional()
  ),
  /**
   * P1095 — Opt-in durable store (Supabase responses_tool_states).
   * Requires RESPONSES_STATE_ENCRYPTION_KEY. Default off → memory Map only.
   */
  TOKFAI_RESPONSES_TOOL_STATE_DURABLE: z
    .string()
    .optional()
    .default("false")
    .transform((raw) => raw === "true" || raw === "1" || raw === "yes"),

  GRSAI_BASE_URL: z.string().url().optional(),
  GRSAI_API_BASE: z.string().url().optional(),
  GRSAI_API_KEY: z.string().min(1),
  GRSAI_CHAT_COMPLETIONS_PATH: z
    .string()
    .min(1)
    .default("/v1/chat/completions"),
  GRSAI_IMAGE_GENERATE_PATH: z
    .string()
    .min(1)
    .default("/v1/api/generate"),
  GRSAI_IMAGE_INPUT_MODE: z
    .enum([
      "images_url",
      "image_url",
      "imageUrl",
      "input_image",
      "referenceImages",
      "images_data_url",
    ])
    .default("images_url"),
  IMAGE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(180_000),
  GRSAI_CHAT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(90_000),
  /** Default upstream timeout for /v1/chat/completions (keep short). */
  TOKFAI_UPSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(90_000),
  /** Ordinary /v1/responses upstream timeout (not Codex/heavy). */
  TOKFAI_RESPONSES_UPSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(300_000),
  /** Codex / coding / heavy /v1/responses upstream timeout. */
  TOKFAI_HEAVY_RESPONSES_UPSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(700_000),
  /**
   * Idle timeout for stream=true heavy responses — abort only when upstream
   * sends no data for this long (not a short total wall-clock cut).
   */
  TOKFAI_HEAVY_RESPONSES_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(700_000),
  /** Per API key concurrent heavy /v1/responses cap (avoids infinite hang). */
  TOKFAI_HEAVY_RESPONSES_MAX_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  /**
   * P1001 — In-process Heavy /v1/responses bounded FIFO queue.
   * Default false: keep fail-fast 429 when concurrency is saturated.
   */
  TOKFAI_HEAVY_QUEUE_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((raw) => raw === "true" || raw === "1"),
  /** Max waiting Heavy requests per limitKey when queue is enabled. */
  TOKFAI_HEAVY_QUEUE_MAX_WAITERS_PER_KEY: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(4),
  /** Max waiting Heavy requests across all keys in this process. */
  TOKFAI_HEAVY_QUEUE_MAX_WAITERS_GLOBAL: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(20),
  /** Max time a Heavy request may wait for a concurrency slot (ms). */
  TOKFAI_HEAVY_QUEUE_WAIT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(30_000),
  /**
   * P1080 — /v1/responses stream=true no-tools transparent gateway:
   * wall budget for upstream no-output so clients get response.failed+[DONE]
   * inside the common ~120s client timeout (not heavy 700s ping-only hang).
   */
  TOKFAI_RESPONSES_STREAM_NO_OUTPUT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(120_000)
    .default(100_000),
  /** Overall request wall clock (non-tool chat); keep moderate. */
  TOKFAI_TOTAL_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(180_000),
  /**
   * P970 — Non-stream chat wall / idle budget (not heavy 700s).
   * Alias of total chat budget when tools are absent.
   */
  TOKFAI_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  /** P970 — Client stream=true chat idle/wall budget. */
  TOKFAI_STREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  /**
   * P970 — Only when request includes tools / tool_choice.
   * Never apply global 700s; tool path uses this dedicated budget.
   */
  TOKFAI_TOOL_CALL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(420_000),
  /**
   * P970 — Per-upstream-attempt budget (alias of TOKFAI_UPSTREAM_TIMEOUT_MS).
   * Kept as a named knob for ops; defaults match UPSTREAM_ATTEMPT_TIMEOUT_MS=90s.
   */
  TOKFAI_UPSTREAM_ATTEMPT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  TOKFAI_CHAT_BODY_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_048_576),
  TOKFAI_RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
  TOKFAI_RATE_LIMIT_IP_RPM: z.coerce.number().int().positive().default(120),
  TOKFAI_RATE_LIMIT_TENANT_RPM: z.coerce.number().int().positive().default(600),
  /** Soft TPM (tokens/min) per API key / caller — estimated before upstream. */
  TOKFAI_RATE_LIMIT_TPM: z.coerce.number().int().positive().default(200_000),
  /** Per-user daily credit spend cap (charged usage_logs sum). */
  TOKFAI_DAILY_CREDIT_LIMIT: z.coerce.number().positive().default(10_000),
  /** Per-user monthly credit spend cap (charged usage_logs sum). */
  TOKFAI_MONTHLY_CREDIT_LIMIT: z.coerce.number().positive().default(100_000),
  /**
   * P982 — Trial / per-key commercial guard (early block before upstream).
   * When false, per-key trial_mode columns are ignored.
   */
  TOKFAI_TRIAL_GUARD_ENABLED: z
    .string()
    .optional()
    .default("true")
    .transform((raw) => raw === "true" || raw === "1"),
  /** Models allowed for api_keys.trial_mode=true (comma/space separated). */
  TOKFAI_TRIAL_ALLOWED_MODELS: z
    .string()
    .default("auto-fast,auto-cheap")
    .transform(csv),
  /** Lifetime charged-credits cap when trial_mode and trial_credits_limit is null. */
  TOKFAI_TRIAL_DEFAULT_CREDITS_LIMIT: z.coerce
    .number()
    .nonnegative()
    .default(500),
  /** Daily charged-credits cap for trial keys when daily_credit_limit is null. */
  TOKFAI_TRIAL_DAILY_CREDIT_LIMIT: z.coerce
    .number()
    .nonnegative()
    .default(200),
  /** Monthly charged-credits cap for trial keys when monthly_credit_limit is null. */
  TOKFAI_TRIAL_MONTHLY_CREDIT_LIMIT: z.coerce
    .number()
    .nonnegative()
    .default(500),
  /** Hard ceiling for max_tokens / max_completion_tokens / max_output_tokens. */
  TOKFAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(16_384),
  /**
   * Unlimited billing is OFF unless explicitly enabled AND user id is listed.
   * Ordinary users must never receive unlimited / bypass billing.
   */
  TOKFAI_UNLIMITED_BILLING_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((raw) => raw === "true" || raw === "1"),
  TOKFAI_UNLIMITED_BILLING_USER_IDS: z
    .string()
    .default("")
    .transform(csv),
  /**
   * P953 — production KA load-test allowlist (api_keys.id UUID and/or key_id).
   * Empty = no elevation; ordinary defaults unchanged.
   * Never put raw sk-tokfai_ secrets here.
   */
  KA_LOAD_TEST_KEYS: z.string().default("").transform(csv),
  /** P953 — production KA load-test tenant ids (tenants.id UUID). */
  KA_LOAD_TEST_TENANTS: z.string().default("").transform(csv),
  /** Elevated per-key RPM for KA load-test allowlist only. */
  KA_LOAD_TEST_KEY_RPM: z.coerce.number().int().positive().default(1200),
  /** Elevated per-key concurrency for KA load-test allowlist only. */
  KA_LOAD_TEST_KEY_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
  /** Elevated per-tenant RPM for KA load-test allowlist only. */
  KA_LOAD_TEST_TENANT_RPM: z.coerce.number().int().positive().default(3000),
  /**
   * Elevated per-IP RPM when the request is on the KA load-test allowlist
   * (same-host press tools would otherwise die at the normal IP gate first).
   */
  KA_LOAD_TEST_IP_RPM: z.coerce.number().int().positive().default(6000),
  TOKFAI_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  TOKFAI_MAX_CONCURRENCY_PER_KEY: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(50),
  TOKFAI_UPSTREAM_SECONDARY_BASE_URL: z.string().url().optional(),
  TOKFAI_UPSTREAM_SECONDARY_API_KEY: z.string().min(1).optional(),
  TOKFAI_UPSTREAM_SECONDARY_CHAT_PATH: z
    .string()
    .min(1)
    .default("/v1/chat/completions"),
  TOKFAI_UPSTREAM_SECONDARY_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((raw) => raw === "true" || raw === "1"),
  /**
   * P1100 — when no secondary provider is configured, allow one same-provider
   * retry for no-HTTP-response transport errors (connect/headers/socket).
   * Default on. Set "0"/"false" to disable. Success path unchanged.
   */
  TOKFAI_UPSTREAM_TRANSPORT_SAME_PROVIDER_RETRY: z
    .string()
    .optional()
    .default("true")
    .transform((raw) => raw !== "false" && raw !== "0"),
  TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_4: z.string().optional(),
  TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_5: z.string().optional(),
  TOKFAI_BATCH_MAX_ITEMS: z.coerce.number().int().positive().default(100),
  TOKFAI_BATCH_ITEM_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  TOKFAI_BATCH_ITEM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(180_000),
  TOKFAI_BATCH_MAX_RUNTIME_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000),
  TOKFAI_BATCH_ITEM_MAX_RETRIES: z.coerce
    .number()
    .int()
    .min(0)
    .default(1),
  TOKFAI_BATCH_LOCK_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000),
  TOKFAI_REDIS_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((raw) => raw === "true" || raw === "1"),
  TOKFAI_REDIS_URL: z.string().url().optional(),
  TOKFAI_REDIS_KEY_PREFIX: z.string().min(1).default("tokfai"),
  /**
   * P974 — Comma/space-separated model ids verified for real tool_calls in LIVE.
   * Empty (default) → no model advertises capabilities.tools=true; forced tools
   * requests return model_not_tool_capable (not_billable).
   */
  VERIFIED_TOOLS_CAPABLE_MODEL_IDS: z.string().default(""),
  BOT_MODEL: z.string().min(1).default("auto-fast"),

  /**
   * P1072 — Isolated OpenAI-compatible STT upstream (optional).
   * When unset, /v1/audio/transcriptions returns audio_transcription_not_available.
   * Never reuse chat executeChatCompletion for STT.
   */
  TOKFAI_STT_PROVIDER: z.string().optional().default("openai_compatible"),
  TOKFAI_STT_BASE_URL: z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? undefined : v),
    z.string().url().optional()
  ),
  TOKFAI_STT_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? undefined : v),
    z.string().min(1).optional()
  ),
  TOKFAI_STT_DEFAULT_MODEL: z.string().optional().default("whisper-1"),
  TOKFAI_STT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(60_000),
  /**
   * P1079R2 — Max audio file upload bytes for /v1/audio/transcriptions.
   * Enforced before worker call (Content-Length early + streamed body cap).
   * Default 25MiB (OpenAI-compatible). Safe for ~1GB HKG gateway.
   */
  TOKFAI_STT_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024)
    .optional()
    .default(25 * 1024 * 1024),
  /** Flat credits per success; empty/unset → not_billable (never fake chat-token debit). */
  TOKFAI_STT_PRICE_CREDITS: z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? undefined : v),
    z.string().optional()
  ),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  BILLING_ALLOWED_AMOUNTS: z
    .string()
    .default("10,25,50,100")
    .transform((raw) =>
      csv(raw).map((n) => {
        const v = Number(n);
        if (!Number.isFinite(v) || v <= 0) {
          throw new Error(`BILLING_ALLOWED_AMOUNTS contains invalid value: ${n}`);
        }
        return v;
      })
    ),

  BILLING_ALLOWED_REDIRECT_ORIGINS: z
    .string()
    .default("https://tokfai.com,http://localhost:3000")
    .transform(csv),
  })
  .transform((data) => {
    const rawBase =
      data.GRSAI_BASE_URL ?? data.GRSAI_API_BASE ?? "https://grsaiapi.com";
    const chatPath = data.GRSAI_CHAT_COMPLETIONS_PATH.startsWith("/")
      ? data.GRSAI_CHAT_COMPLETIONS_PATH
      : `/${data.GRSAI_CHAT_COMPLETIONS_PATH}`;
    const imagePath = data.GRSAI_IMAGE_GENERATE_PATH.startsWith("/")
      ? data.GRSAI_IMAGE_GENERATE_PATH
      : `/${data.GRSAI_IMAGE_GENERATE_PATH}`;

    return {
      ...data,
      // GRSAI paths already include /v1/... — strip a trailing /v1 from base
      // so GRSAI_API_BASE=https://host/v1 does not become .../v1/v1/chat/...
      GRSAI_BASE_URL: normalizeGrsaiBaseUrl(rawBase),
      GRSAI_CHAT_COMPLETIONS_PATH: chatPath,
      GRSAI_IMAGE_GENERATE_PATH: imagePath,
      // P970: named attempt timeout aliases TOKFAI_UPSTREAM_TIMEOUT_MS when set.
      TOKFAI_UPSTREAM_TIMEOUT_MS:
        data.TOKFAI_UPSTREAM_ATTEMPT_TIMEOUT_MS ??
        data.TOKFAI_UPSTREAM_TIMEOUT_MS,
    };
  });

/** Host + pathname for upstream diagnostics (no secrets). */
export function grsaiUpstreamTarget(path: string): { host: string; path: string } {
  const base = env.GRSAI_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  return { host: url.host, path: url.pathname };
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return `**** (len=${value.length})`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

function normalizeGrsaiBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed.slice(0, -3);
  }
  return trimmed;
}

export type Env = z.infer<typeof Schema>;

function load(): Env {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "invalid_env",
        status: 500,
        code: "invalid_env",
        message: "Invalid DMIT environment configuration.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
          received: "received" in issue ? issue.received : undefined,
        })),
      })}\n`
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = load();
