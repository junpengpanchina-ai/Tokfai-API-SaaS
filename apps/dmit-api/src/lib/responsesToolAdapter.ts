/**
 * P1083 — Responses API → Chat Completions tools / tool_choice adapter.
 *
 * Responses function tool:
 *   { type:"function", name, description?, parameters?, strict? }
 * Chat Completions function tool:
 *   { type:"function", function:{ name, description?, parameters?, strict? } }
 *
 * Responses named tool_choice:
 *   { type:"function", name:"x" }
 * Chat Completions named tool_choice:
 *   { type:"function", function:{ name:"x" } }
 *
 * Scope: /v1/responses → upstream chat/completions only.
 * Never mutates native /v1/chat/completions client bodies.
 * Does not execute tools; protocol shape only.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function copyFunctionFields(
  src: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof src.name === "string" && src.name.trim()) {
    out.name = src.name.trim();
  }
  if (typeof src.description === "string") {
    out.description = src.description;
  }
  if (src.parameters !== undefined) {
    out.parameters = src.parameters;
  } else {
    out.parameters = { type: "object", properties: {} };
  }
  if (typeof src.strict === "boolean") {
    out.strict = src.strict;
  }
  return out;
}

function isChatCompletionsFunctionTool(
  row: Record<string, unknown>
): boolean {
  const nested = asRecord(row.function);
  return Boolean(
    nested && typeof nested.name === "string" && nested.name.trim()
  );
}

function isResponsesFlatFunctionTool(row: Record<string, unknown>): boolean {
  if (isChatCompletionsFunctionTool(row)) return false;
  const type = typeof row.type === "string" ? row.type : "";
  // Flat Responses function tools put name at the top level.
  // Also accept missing/empty type when name is present (lenient clients).
  if (type && type !== "function") return false;
  return typeof row.name === "string" && Boolean(row.name.trim());
}

/**
 * Normalize Responses (or mixed) tools for Chat Completions upstream.
 * Already-nested chat tools pass through without re-wrapping.
 * Unknown non-function tool types pass through unchanged.
 */
export function normalizeResponsesToolsForChatCompletions(
  tools: unknown
): unknown {
  if (!Array.isArray(tools)) return tools;

  const out: unknown[] = [];
  for (const item of tools) {
    const row = asRecord(item);
    if (!row) {
      out.push(item);
      continue;
    }

    if (isChatCompletionsFunctionTool(row)) {
      const nested = asRecord(row.function)!;
      const fn = copyFunctionFields(nested);
      // Prefer nested strict; fall back to top-level strict if present.
      if (
        fn.strict === undefined &&
        typeof row.strict === "boolean"
      ) {
        fn.strict = row.strict;
      }
      out.push({ type: "function", function: fn });
      continue;
    }

    if (isResponsesFlatFunctionTool(row)) {
      out.push({
        type: "function",
        function: copyFunctionFields(row),
      });
      continue;
    }

    // Unknown / non-function tool types: passthrough (do not invent wrappers).
    out.push(row);
  }

  return out;
}

/**
 * Normalize Responses tool_choice for Chat Completions upstream.
 * Strings (auto/none/required) and already-nested chat objects pass through.
 * Responses named function `{type:"function", name}` → chat wrapper.
 */
export function normalizeResponsesToolChoiceForChatCompletions(
  toolChoice: unknown
): unknown {
  if (toolChoice == null) return toolChoice;
  if (typeof toolChoice === "string") return toolChoice;

  const row = asRecord(toolChoice);
  if (!row) return toolChoice;

  // Already Chat Completions named function shape.
  const nested = asRecord(row.function);
  if (
    row.type === "function" &&
    nested &&
    typeof nested.name === "string" &&
    nested.name.trim()
  ) {
    return {
      type: "function",
      function: { name: nested.name.trim() },
    };
  }

  // Responses named function shape: { type:"function", name:"x" }
  if (
    row.type === "function" &&
    typeof row.name === "string" &&
    row.name.trim() &&
    !nested
  ) {
    return {
      type: "function",
      function: { name: row.name.trim() },
    };
  }

  // Responses-ish with empty/malformed nested function but top-level name.
  if (
    row.type === "function" &&
    typeof row.name === "string" &&
    row.name.trim() &&
    nested &&
    (typeof nested.name !== "string" || !nested.name.trim())
  ) {
    return {
      type: "function",
      function: { name: row.name.trim() },
    };
  }

  // Unknown object shapes (allowed_tools, etc.): passthrough.
  return toolChoice;
}
