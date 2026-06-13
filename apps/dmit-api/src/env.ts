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
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_JWT_SECRET: z.string().min(20),
  TOKFAI_ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((raw) => csv(raw).map((email) => email.toLowerCase())),

  TOKEN_PEPPER: z.string().min(32, "TOKEN_PEPPER must be at least 32 chars"),
  TOKFAI_KEY_ENCRYPTION_SECRET: z.string().optional(),

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
    .default(120_000),
  GRSAI_CHAT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(90_000),
  TOKFAI_UPSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(90_000),
  TOKFAI_TOTAL_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000),
  TOKFAI_CHAT_BODY_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_048_576),
  TOKFAI_RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
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
  BOT_MODEL: z.string().min(1).default("auto-fast"),

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
      })}\n`
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = load();
