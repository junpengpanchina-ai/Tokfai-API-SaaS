/**
 * P1062 — numeric-only chat body size diagnostics (no content / secrets).
 *
 * Measures UTF-8 JSON byte lengths at the provider boundary so large Cursor
 * tool payloads can be diagnosed without logging tool schemas, messages,
 * prompts, Authorization, or API keys.
 */

export type ChatBodyByteDiagnostics = {
  clientBodyByteLength: number;
  upstreamBodyByteLength: number;
  messagesByteLength: number;
  toolsByteLength: number;
  toolsCount: number;
  largestToolSchemaBytes: number;
  messageCount: number;
  /** For tests only — never log these names in production telemetry. */
  toolNames: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** UTF-8 byte length of JSON.stringify(value); 0 on failure. */
export function utf8JsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return 0;
  }
}

function toolNameOf(tool: unknown): string | null {
  const row = asRecord(tool);
  if (!row) return null;
  const fn = asRecord(row.function);
  if (fn && typeof fn.name === "string" && fn.name.trim()) {
    return fn.name.trim();
  }
  if (typeof row.name === "string" && row.name.trim()) {
    return row.name.trim();
  }
  return null;
}

/**
 * Compute size diagnostics for client vs upstream chat bodies.
 * Returns numbers (+ toolNames for unit tests). Never includes body text.
 */
export function measureChatCompletionBodyBytes(args: {
  clientBody: unknown;
  upstreamBody: unknown;
}): ChatBodyByteDiagnostics {
  const client = asRecord(args.clientBody) ?? {};
  const upstream = asRecord(args.upstreamBody) ?? {};
  const messages = Array.isArray(upstream.messages) ? upstream.messages : [];
  const tools = Array.isArray(upstream.tools) ? upstream.tools : [];

  let largestToolSchemaBytes = 0;
  const toolNames: string[] = [];
  for (const tool of tools) {
    const bytes = utf8JsonByteLength(tool);
    if (bytes > largestToolSchemaBytes) largestToolSchemaBytes = bytes;
    const name = toolNameOf(tool);
    if (name) toolNames.push(name);
  }

  return {
    clientBodyByteLength: utf8JsonByteLength(client),
    upstreamBodyByteLength: utf8JsonByteLength(upstream),
    messagesByteLength: utf8JsonByteLength(messages),
    toolsByteLength: utf8JsonByteLength(tools),
    toolsCount: tools.length,
    largestToolSchemaBytes,
    messageCount: messages.length,
    toolNames,
  };
}
