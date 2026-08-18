import type { OpenAiModelListItem } from "../catalog/modelPricing.js";

/**
 * OpenAI clients read `data[]`. Codex CLI (wire_api=responses) expects `models[]`.
 * Both arrays are the same catalog objects — additive, not a replacement.
 */
export type ModelsListPayload = {
  object: "list";
  data: OpenAiModelListItem[];
  models: OpenAiModelListItem[];
};

export function buildModelsListPayload(data: OpenAiModelListItem[]): ModelsListPayload {
  return {
    object: "list",
    data,
    models: data,
  };
}

export type ModelsListCompatCheck = {
  jsonParseOk: boolean;
  objectIsList: boolean;
  dataIsArray: boolean;
  modelsIsArray: boolean;
  requiredIdInData: boolean;
  requiredIdInModels: boolean;
};

function hasModelIdOrName(row: unknown, requiredId: string): boolean {
  if (!row || typeof row !== "object") return false;
  const rec = row as { id?: unknown; name?: unknown };
  return rec.id === requiredId || rec.name === requiredId;
}

export function checkModelsListCompat(
  raw: string,
  requiredId = "gemini-3-pro"
): ModelsListCompatCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      jsonParseOk: false,
      objectIsList: false,
      dataIsArray: false,
      modelsIsArray: false,
      requiredIdInData: false,
      requiredIdInModels: false,
    };
  }

  const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const data = rec["data"];
  const models = rec["models"];
  const dataArr = Array.isArray(data) ? data : [];
  const modelsArr = Array.isArray(models) ? models : [];

  return {
    jsonParseOk: true,
    objectIsList: rec["object"] === "list",
    dataIsArray: Array.isArray(data),
    modelsIsArray: Array.isArray(models),
    requiredIdInData: dataArr.some((row) => hasModelIdOrName(row, requiredId)),
    requiredIdInModels: modelsArr.some((row) => hasModelIdOrName(row, requiredId)),
  };
}

export function modelsListCompatPassed(check: ModelsListCompatCheck): boolean {
  return (
    check.jsonParseOk &&
    check.objectIsList &&
    check.dataIsArray &&
    check.modelsIsArray &&
    check.requiredIdInData &&
    check.requiredIdInModels
  );
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return entry.includes("modelsListCompat");
}

if (isDirectRun()) {
  const data: OpenAiModelListItem[] = [
    {
      id: "gemini-3-pro",
      object: "model",
      created: 0,
      owned_by: "tokfai",
      name: "Gemini 3 Pro",
      display_name: "Gemini 3 Pro",
      title: "Gemini 3 Pro",
    },
  ];
  const payload = buildModelsListPayload(data);
  const raw = JSON.stringify(payload);
  const check = checkModelsListCompat(raw, "gemini-3-pro");
  const ok = modelsListCompatPassed(check);
  if (!ok) {
    console.error("TOKFAI_P1260_MODELS_LIST_COMPAT_PASS=NO", check);
    process.exit(1);
  }
  console.log("TOKFAI_P1260_MODELS_LIST_COMPAT_PASS=YES");
}
