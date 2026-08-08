/**
 * P1061 — auto-pro transparent Carrier Model.
 *
 * Cursor owns Agent orchestration (Search/Read/Write/Terminal, task completion).
 * Tokfai owns model routing / protocol / provider / billing.
 *
 * When the client requests model "auto-pro", Tokfai may route once to a concrete
 * upstream (gpt-5.5 / gpt-5.4 / gemini-3-pro / …). After that route decision,
 * the provider attempt must behave like a normal transparent model call:
 * no P1048/P1049/P1055 Agent arbitration rounds from plain text.
 *
 * Pure predicate only: no User-Agent, no prompt inspection, no tools schema
 * mutation. Client-supplied tool_choice=required / named function remain
 * protocol and are NOT bypassed here.
 */

import { normalizeClientModelId } from "../upstream/modelAliases.js";

/**
 * Request-scoped gate: requestedModel === "auto-pro" → transparent carrier.
 *
 * Uses the client-requested id only (not the resolved upstream attempt).
 */
export function isAutoProTransparentCarrier(args: {
  requestedModel: string;
}): boolean {
  return normalizeClientModelId(args.requestedModel) === "auto-pro";
}
