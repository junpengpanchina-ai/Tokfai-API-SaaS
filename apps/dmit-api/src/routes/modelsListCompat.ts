import type { OpenAiModelListItem } from "../catalog/modelPricing.js";

/**
 * OpenAI clients read `data[]` (unchanged catalog objects).
 * Codex CLI also needs `models[]` with `slug`, `supported_reasoning_levels`,
 * and `shell_type` (decode error: missing `shell_type`).
 * `models[]` is a Codex-shaped copy; `data[]` is not mutated.
 */
export type CodexModelListItem = OpenAiModelListItem & {
  slug: string;
  supported_reasoning_levels: string[];
  shell_type: string;
};

export type ModelsListPayload = {
  object: "list";
  data: OpenAiModelListItem[];
  models: CodexModelListItem[];
};

const DEFAULT_SHELL_TYPE = "default";

export function toCodexModelsList(data: OpenAiModelListItem[]): CodexModelListItem[] {
  return data.map((item) => ({
    ...item,
    id: item.id,
    name: item.name,
    slug: item.id,
    supported_reasoning_levels: [],
    shell_type: DEFAULT_SHELL_TYPE,
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
  modelsAllHaveSlug: boolean;
  modelsAllHaveSupportedReasoningLevels: boolean;
  modelsAllHaveShellType: boolean;
  dataHasNoSlug: boolean;
  dataHasNoSupportedReasoningLevels: boolean;
  dataHasNoShellType: boolean;
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

function hasNonEmptySlug(row: unknown): boolean {
  return isRecord(row) && typeof row["slug"] === "string" && row["slug"].length > 0;
}

function hasSupportedReasoningLevelsArray(row: unknown): boolean {
  return isRecord(row) && Array.isArray(row["supported_reasoning_levels"]);
}

function hasShellType(row: unknown): boolean {
  return isRecord(row) && typeof row["shell_type"] === "string" && row["shell_type"].length > 0;
}

function dataRowHasKey(row: unknown, key: string): boolean {
  return isRecord(row) && Object.prototype.hasOwnProperty.call(row, key);
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
    modelsAllHaveSlug: false,
    modelsAllHaveSupportedReasoningLevels: false,
    modelsAllHaveShellType: false,
    dataHasNoSlug: false,
    dataHasNoSupportedReasoningLevels: false,
    dataHasNoShellType: false,
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

  return {
    jsonParseOk: true,
    objectIsList: rec["object"] === "list",
    dataIsArray: Array.isArray(data),
    modelsIsArray: Array.isArray(models),
    modelsAllHaveSlug: modelsArr.length > 0 && modelsArr.every(hasNonEmptySlug),
    modelsAllHaveSupportedReasoningLevels:
      modelsArr.length > 0 && modelsArr.every(hasSupportedReasoningLevelsArray),
    modelsAllHaveShellType: modelsArr.length > 0 && modelsArr.every(hasShellType),
    dataHasNoSlug: dataArr.every((row) => !dataRowHasKey(row, "slug")),
    dataHasNoSupportedReasoningLevels: dataArr.every(
      (row) => !dataRowHasKey(row, "supported_reasoning_levels")
    ),
    dataHasNoShellType: dataArr.every((row) => !dataRowHasKey(row, "shell_type")),
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
    check.modelsAllHaveSlug &&
    check.modelsAllHaveSupportedReasoningLevels &&
    check.modelsAllHaveShellType &&
    check.dataHasNoSlug &&
    check.dataHasNoSupportedReasoningLevels &&
    check.dataHasNoShellType &&
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
    console.error("TOKFAI_P1263_MODELS_SHELL_TYPE_COMPAT_PASS=NO", check);
    process.exit(1);
  }
  console.log("TOKFAI_P1263_MODELS_SHELL_TYPE_COMPAT_PASS=YES");
}
