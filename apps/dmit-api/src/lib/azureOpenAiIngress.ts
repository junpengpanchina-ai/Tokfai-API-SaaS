import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { normalizeClientModelId } from "../upstream/modelAliases.js";

/**
 * P1067 — Azure OpenAI path deployment → Tokfai model id.
 *
 * Reuses normalizeClientModelId so GPT-5.4 / gpt-5.4 → gpt-5.4.
 * Further alias resolution (gpt-5.4 → gpt-5 chain) happens in the
 * existing chat completions pipeline via resolveChatModel.
 */
export function normalizeAzureDeploymentToModel(deployment: string): string {
  return normalizeClientModelId(deployment);
}

export function parseAzureDeploymentParam(
  raw: string | undefined
): { ok: true; azureDeployment: string; normalizedModel: string } | {
  ok: false;
  error: ApiError;
} {
  const azureDeployment = (raw ?? "").trim();
  if (!azureDeployment) {
    return {
      ok: false,
      error: ApiError.badRequest(
        "Missing Azure OpenAI deployment name.",
        "invalid_request_error"
      ),
    };
  }

  let decoded = azureDeployment;
  try {
    decoded = decodeURIComponent(azureDeployment);
  } catch {
    decoded = azureDeployment;
  }

  const normalizedModel = normalizeAzureDeploymentToModel(decoded);
  if (!normalizedModel) {
    return {
      ok: false,
      error: ApiError.badRequest(
        "Invalid Azure OpenAI deployment name.",
        "invalid_request_error"
      ),
    };
  }

  return { ok: true, azureDeployment: decoded, normalizedModel };
}

/**
 * Azure path deployment is authoritative for body.model.
 * Never let a client body.model silently override the deployment.
 * All other fields are preserved (messages, tools, stream, …).
 */
export function applyAzureDeploymentModel(args: {
  rawBody: unknown;
  normalizedModel: string;
}): Record<string, unknown> {
  const { rawBody, normalizedModel } = args;
  if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return {
      ...(rawBody as Record<string, unknown>),
      model: normalizedModel,
    };
  }
  // Non-object bodies still need a model for schema; pipeline will 400 on shape.
  return { model: normalizedModel };
}

export function logAzureOpenAiIngress(args: {
  requestId: string;
  azureDeployment: string;
  normalizedModel: string;
  apiVersionPresent: boolean;
}): void {
  log.info("azure_openai_ingress", {
    requestId: args.requestId,
    route: "/v1/openai/deployments/:deployment/chat/completions",
    azureDeployment: args.azureDeployment,
    normalizedModel: args.normalizedModel,
    apiVersionPresent: args.apiVersionPresent,
  });
}
