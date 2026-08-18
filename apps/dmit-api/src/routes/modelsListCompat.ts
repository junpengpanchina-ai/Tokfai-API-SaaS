import type { OpenAiModelListItem } from "../catalog/modelPricing.js";

/**
 * OpenAI clients read `data[]` (unchanged catalog objects).
 * Codex CLI also needs `models[]` with a `slug` field (decode error: missing `slug`).
 * `models[]` is a Codex-shaped copy; `data[]` is not mutated.
 */
export type CodexModelListItem = OpenAiModelListItem & {
  slug: string;
};

export type ModelsListPayload = {
  object: "list";
  data: OpenAiModelListItem[];
  models: CodexModelListItem[];
};

export function toCodexModelsList(data: OpenAiModelListItem[]): CodexModelListItem[] {
  return data.map((item) => ({
    ...item,
    id: item.id,
    name: item.name,
    slug: item.id,
  }));
}

export function buildModelsListPayload(data: OpenAiModelListItem[]): ModelsListPayload {
  return {
    object: "list",
    data,
    models: toCodexModelsList(data),
  };
}

export type ModelsListCompatCheck = {
  jsonParseOk: boolean;
  objectIsList: boolean;
  dataIsArray: boolean;
  modelsIsArray: boolean;
  models0HasSlug: boolean;
  data0HasNoSlug: boolean;
  requiredIdInData: boolean;
  requiredIdInModels: boolean;
};

function isRecord(row: unknown): row is Record<string, unknown> {
  return Boolean(row) && typeof row === "object";
}

function dataRowHasId(row: unknown, requiredId: string): boolean {
  return isRecord(row) && row["id"] === requiredId;
}

function modelsRowHasIdNameOrSlug(row: unknown, requiredId: string): boolean {
  if (!isRecord(row)) return false;
  return row["id"] === requiredId || row["name"] === requiredId || row["slug"] === requiredId;
}

export function checkModelsListCompat(
  raw: string,
  requiredId = "gemini-3-pro"
): ModelsListCompatCheck {
  const failed: ModelsListCompatCheck = {
    jsonParseOk: false,
    objectIsList: false,
    dataIsArray: false,
    modelsIsArray: false,
    models0HasSlug: false,
    data0HasNoSlug: false,
    requiredIdInData: false,
    requiredIdInModels: false,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return failed;
  }

  const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const data = rec["data"];
  const models = rec["models"];
  const dataArr = Array.isArray(data) ? data : [];
  const modelsArr = Array.isArray(models) ? models : [];
  const models0 = modelsArr[0];
  const data0 = dataArr[0];

  return {
    jsonParseOk: true,
    objectIsList: rec["object"] === "list",
    dataIsArray: Array.isArray(data),
    modelsIsArray: Array.isArray(models),
    models0HasSlug: isRecord(models0) && typeof models0["slug"] === "string" && models0["slug"].length > 0,
    data0HasNoSlug: !isRecord(data0) || !Object.prototype.hasOwnProperty.call(data0, "slug"),
    requiredIdInData: dataArr.some((row) => dataRowHasId(row, requiredId)),
    requiredIdInModels: modelsArr.some((row) => modelsRowHasIdNameOrSlug(row, requiredId)),
  };
}

export function modelsListCompatPassed(check: ModelsListCompatCheck): boolean {
  return (
    check.jsonParseOk &&
    check.objectIsList &&
    check.dataIsArray &&
    check.modelsIsArray &&
    check.models0HasSlug &&
    check.data0HasNoSlug &&
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
    console.error("TOKFAI_P1261_MODELS_SLUG_COMPAT_PASS=NO", check);
    process.exit(1);
  }
  console.log("TOKFAI_P1261_MODELS_SLUG_COMPAT_PASS=YES");
}
