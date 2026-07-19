import { env } from "../env.js";
import { log } from "../logger.js";

export interface RedisHealthStatus {
  enabled: boolean;
  connected: boolean;
}

type RedisClient = {
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { NX?: boolean; EX?: number; PX?: number }
  ): Promise<string | null>;
  incr(key: string): Promise<number>;
  incrBy(key: string, increment: number): Promise<number>;
  decr(key: string): Promise<number>;
  del(key: string | string[]): Promise<number>;
  exists(key: string | string[]): Promise<number>;
  pExpire(key: string, ms: number): Promise<boolean>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

let client: RedisClient | null = null;
let connected = false;
let warnedDisabled = false;

export function redisKey(...parts: string[]): string {
  return `${env.TOKFAI_REDIS_KEY_PREFIX}:${parts.join(":")}`;
}

export function getRedisHealthStatus(): RedisHealthStatus {
  return {
    enabled: env.TOKFAI_REDIS_ENABLED,
    connected: env.TOKFAI_REDIS_ENABLED && connected && client !== null,
  };
}

export function isRedisActive(): boolean {
  return env.TOKFAI_REDIS_ENABLED && connected && client !== null;
}

export function getRedisClient(): RedisClient | null {
  if (!isRedisActive() || !client) return null;
  return client;
}

function warnInMemoryFallback(reason: string, message: string): void {
  if (warnedDisabled) return;
  warnedDisabled = true;
  log.warn(reason, { message });
}

export async function initRedis(): Promise<void> {
  if (!env.TOKFAI_REDIS_ENABLED) {
    log.info("redis_disabled", {
      message: "Gateway and batch state use in-memory fallback.",
    });
    return;
  }

  if (!env.TOKFAI_REDIS_URL) {
    warnInMemoryFallback(
      "redis_url_missing",
      "TOKFAI_REDIS_ENABLED=true but TOKFAI_REDIS_URL is unset; using in-memory fallback."
    );
    return;
  }

  try {
    const { createClient } = await import("redis");
    const nextClient = createClient({ url: env.TOKFAI_REDIS_URL });

    nextClient.on("error", (err) => {
      connected = false;
      log.warn("redis_client_error", {
        message: err instanceof Error ? err.message : String(err),
      });
    });

    nextClient.on("ready", () => {
      connected = true;
    });

    await nextClient.connect();
    client = nextClient as RedisClient;
    connected = true;

    log.info("redis_connected", {
      prefix: env.TOKFAI_REDIS_KEY_PREFIX,
    });
  } catch (err) {
    client = null;
    connected = false;
    warnInMemoryFallback(
      "redis_connect_failed",
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function closeRedis(): Promise<void> {
  if (!client) return;

  try {
    await client.quit();
  } catch {
    // ignore shutdown errors
  } finally {
    client = null;
    connected = false;
  }
}
