/**
 * P1017 — Tool intent limits + minimal JSON Schema validation for arguments.
 * No new dependencies — covers the OpenAI tools parameters subset we need.
 */

export const MAX_TOOL_CALLS = 8;
export const MAX_ARGUMENTS_JSON_BYTES = 32 * 1024;

export type SchemaValidationResult =
  | { ok: true }
  | { ok: false; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Booleans must never count as integers/numbers for tool arguments. */
export function isJsonInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value);
}

export function isJsonNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function matchJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return isJsonNumber(value);
    case "integer":
      return isJsonInteger(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

/**
 * Validate `value` against a JSON Schema fragment (client tool parameters).
 * Supports: type, properties, required, additionalProperties, items, enum,
 * and nested object/array.
 */
export function validateAgainstJsonSchema(
  value: unknown,
  schema: unknown,
  path = "$"
): SchemaValidationResult {
  if (!isPlainObject(schema)) {
    return { ok: true };
  }

  if (Array.isArray(schema.enum)) {
    const ok = schema.enum.some((e) => Object.is(e, value));
    if (!ok) {
      return {
        ok: false,
        message: `${path} must be one of the allowed enum values`,
      };
    }
  }

  const type = schema.type;
  if (typeof type === "string") {
    if (!matchJsonType(value, type)) {
      return { ok: false, message: `${path} must be of type ${type}` };
    }
  } else if (Array.isArray(type)) {
    if (!type.some((t) => typeof t === "string" && matchJsonType(value, t))) {
      return {
        ok: false,
        message: `${path} must be one of types ${type.join("|")}`,
      };
    }
  }

  if (isPlainObject(value) && isPlainObject(schema.properties)) {
    const required = Array.isArray(schema.required)
      ? schema.required.filter((r): r is string => typeof r === "string")
      : [];
    for (const key of required) {
      if (!(key in value)) {
        return { ok: false, message: `${path}.${key} is required` };
      }
    }
    const additional = schema.additionalProperties;
    for (const [key, child] of Object.entries(value)) {
      const propSchema = schema.properties[key];
      if (propSchema !== undefined) {
        const nested = validateAgainstJsonSchema(
          child,
          propSchema,
          `${path}.${key}`
        );
        if (!nested.ok) return nested;
      } else if (additional === false) {
        return {
          ok: false,
          message: `${path} has unexpected property ${key}`,
        };
      } else if (isPlainObject(additional)) {
        const nested = validateAgainstJsonSchema(
          child,
          additional,
          `${path}.${key}`
        );
        if (!nested.ok) return nested;
      }
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    for (let i = 0; i < value.length; i++) {
      const nested = validateAgainstJsonSchema(
        value[i],
        schema.items,
        `${path}[${i}]`
      );
      if (!nested.ok) return nested;
    }
  }

  return { ok: true };
}

export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
