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

const Schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("https://tokfai.com,http://localhost:3000")
    .transform(csv),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_JWT_SECRET: z.string().min(20),

  TOKEN_PEPPER: z.string().min(32, "TOKEN_PEPPER must be at least 32 chars"),

  GRSAI_API_BASE: z.string().url(),
  GRSAI_API_KEY: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
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
});

export type Env = z.infer<typeof Schema>;

function load(): Env {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid DMIT env:\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = load();
