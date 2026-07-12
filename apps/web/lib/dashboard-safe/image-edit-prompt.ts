/**
 * Image Playground prompt helpers — text-to-image vs reference-image edit mode.
 * Client-only prompt shaping; does not change DMIT Image API contracts.
 *
 * IMPORTANT:
 * Prompt is only an auxiliary constraint.
 * Real subject binding comes from the request `images` array sent to DMIT/upstream.
 * If images_count = 0, do not enter reference_edit — block submit instead.
 */

/** Explicit edit / preserve intent — used to require a reference image. */
const REFERENCE_EDIT_INTENT_PATTERN =
  /保留人物|保留主体|保留脸|不要换人|保持人物|只换衣服|换背景|换服装|换风格|换场景|参考图|按原图|照着这张|保留商品|不要换脸|同一张脸|同一个人|基于原图|局部改图|改图|换成|替换成|改成|keep(?:\s+the)?\s+subject|preserve(?:\s+the)?\s+subject|same\s+person|same\s+face|don'?t\s+change(?:\s+the)?\s+face|do\s+not\s+change(?:\s+the)?\s+face|no\s+face\s+swap|keep(?:\s+the)?\s+face|change(?:\s+the)?\s+clothes|change(?:\s+the)?\s+outfit|change(?:\s+the)?\s+background|change(?:\s+the)?\s+scene|outfit\s+change|background\s+change|scene\s+change|edit(?:\s+the)?\s+(?:image|photo)|based\s+on\s+(?:this|the)\s+(?:image|photo|reference)|reference\s+(?:image|photo|edit)/i;

/** Softer hints that still benefit from subject-preserve wrapping when images exist. */
const EDIT_HINT_PATTERN =
  /保留|替换|换成|改成|变成|参考|保持|主体|脸|人物|衣服|背景|场景|西装|中山装|服装|发型|姿态|构图|龙袍|商品|白底|keep|preserve|subject|face|person|outfit|clothes|background|scene|reference|edit/i;

/** Clothing-swap intent — keep edit local; do not reinvent identity/scene. */
const CLOTHING_SWAP_PATTERN =
  /换龙袍|换衣服|换西装|换服装|穿上|把衣服换成|把西装换成|把西服换成|替换成.+袍|换成.+袍|换成.+装|change(?:\s+the)?\s+(?:clothes|outfit|suit)|put\s+on|swap(?:\s+the)?\s+(?:clothes|outfit)/i;

export type ImagePlaygroundMode = "text_to_image" | "reference_edit";

export type BuildReferenceEditPromptOptions = {
  /** Extra-strict pass used by「加强保留主体再试」. */
  strengthen?: boolean;
};

export function getImagePlaygroundMode(
  hasReferenceImages: boolean
): ImagePlaygroundMode {
  return hasReferenceImages ? "reference_edit" : "text_to_image";
}

export function promptImpliesReferenceEdit(prompt: string): boolean {
  return REFERENCE_EDIT_INTENT_PATTERN.test(prompt.trim());
}

export function shouldEnhanceReferenceEditPrompt(prompt: string): boolean {
  return EDIT_HINT_PATTERN.test(prompt) || promptImpliesReferenceEdit(prompt);
}

export function isClothingSwapPrompt(prompt: string): boolean {
  return CLOTHING_SWAP_PATTERN.test(prompt.trim());
}

function extractClothingTarget(prompt: string): string | null {
  const match = prompt.match(
    /(?:把|将)?(.{0,12}?)(?:西装|西服|外套|衣服|服装|上衣|裙子|礼服|T恤|衬衫|裤子|鞋子)?(?:换成|替换成|改成|变成)(.{1,40}?)(?:[，。,.！!？?\n]|$)/
  );
  if (match?.[2]?.trim()) return match[2].trim();

  const wearMatch = prompt.match(/穿上(.{1,40}?)(?:[，。,.！!？?\n]|$)/);
  if (wearMatch?.[1]?.trim()) return wearMatch[1].trim();

  const swapMatch = prompt.match(
    /换(?:成)?(.{1,40}?)(?:[，。,.！!？?\n]|$)/
  );
  if (swapMatch?.[1]?.trim() && /袍|装|服|裙|衣/.test(swapMatch[1])) {
    return swapMatch[1].trim();
  }
  return null;
}

function extractBackgroundChange(prompt: string): string | null {
  if (!/换背景|背景换成|背景改成|白底|棚拍背景/.test(prompt)) return null;
  const match = prompt.match(
    /背景(?:换成|改成|变成)(.{1,40}?)(?:[，。,.！!？?\n]|$)/
  );
  if (match?.[1]) {
    return `只替换背景为：${match[1].trim()}。人物/商品主体完全不变。`;
  }
  if (/白底|电商主图/.test(prompt)) {
    return "只将背景换成干净白底电商主图风格，保留商品形状、颜色、结构与比例，不要重新生成新商品。";
  }
  return "只替换背景，不改变主体。";
}

function extractStyleChange(prompt: string): string | null {
  if (!/换风格|风格改成|改成.+风格/.test(prompt)) return null;
  return "只改变风格表达，不改变人物/商品身份与结构。";
}

function extractProductPreserve(prompt: string): boolean {
  return /保留商品|商品主体|白底电商|电商主图/.test(prompt);
}

function buildClothingSwapPrompt(userPrompt: string, strengthen: boolean): string {
  const target = extractClothingTarget(userPrompt) ?? "用户指定的服装";
  const strengthenLines = strengthen
    ? [
        "请更严格锁定参考图中的同一张脸与同一人物身份。",
        "若服装替换与保脸冲突，优先保脸、保发型、保体型、保姿态。",
      ]
    : [];

  return [
    "基于参考图进行同一人物局部改衣。",
    "严格保留参考图中的同一个人物：脸部五官、发型、发际线、年龄感、肤色、体型、肩颈比例、姿态、镜头角度、人物数量都保持一致。",
    `只把原来的衣服替换成：${target}。`,
    "不要改变人物身份，不要改变脸，不要改变年龄，不要改变体型，不要改变姿态。",
    "不要生成另一个人，不要生成双人，不要左右对比，不要拼图。",
    "背景尽量保持原图或仅轻微优化，不要改成新的复杂场景。",
    "不要自动生成宫殿、皇帝、朝代场景或重新扮演身份；只做服装替换，不是人物重新扮演。",
    "只输出一张图片。",
    `用户原始修改需求：${userPrompt.trim()}`,
    ...strengthenLines,
  ].join("\n");
}

/**
 * Wrap user prompt for reference-image edit so the model edits locally
 * instead of inventing a new subject.
 *
 * Prompt only assists; the `images` array is the real reference constraint.
 */
export function buildReferenceEditPrompt(
  userPrompt: string,
  options: BuildReferenceEditPromptOptions = {}
): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return trimmed;

  const strengthen = options.strengthen === true;

  if (isClothingSwapPrompt(trimmed)) {
    return buildClothingSwapPrompt(trimmed, strengthen);
  }

  const background = extractBackgroundChange(trimmed);
  const style = extractStyleChange(trimmed);
  const productMode = extractProductPreserve(trimmed);

  const subjectBlock = productMode
    ? [
        "请严格保留参考图中的同一个商品主体，不要重新创造新商品。",
        "必须保持：同一外形结构、同一颜色与材质观感、同一比例、同一拍摄角度、同一商品数量。",
        "不要生成多个商品并排、对比图或多个版本。",
      ]
    : [
        "请严格保留参考图中的同一个人物主体，不要重新创造新人物。",
        "必须保持：",
        "- 同一张脸",
        "- 同一五官比例",
        "- 同一发型与发际线",
        "- 同一年龄感",
        "- 同一体型",
        "- 同一姿态",
        "- 同一镜头角度",
        "- 同一人物数量",
        "- 不要生成双人、多人、并排对比图或多个版本",
      ];

  const changeLines: string[] = [];
  if (background) changeLines.push(background);
  if (style) changeLines.push(style);

  if (changeLines.length === 0) {
    changeLines.push(`只允许修改用户明确要求修改的部分：${trimmed}`);
  } else {
    changeLines.unshift(`用户原始修改需求：${trimmed}`);
  }

  const strengthenBlock = strengthen
    ? [
        "请更严格保留参考图中的同一个主体，尤其是脸、发型、体型、姿态和镜头角度。",
        `只修改：${trimmed}`,
        "不要生成新人物，不要双人，不要拼图。",
      ]
    : [];

  return [
    "你正在编辑一张参考图片。",
    "基于参考图进行局部改图。",
    ...subjectBlock,
    "",
    "只允许修改用户明确要求修改的部分：",
    ...changeLines,
    "",
    "如果用户要求换衣服：只替换服装，不改变脸、头部、身体比例和姿态。",
    "如果用户要求换背景：只替换背景，不改变人物/商品主体。",
    "如果用户要求换风格：只改变风格表达，不改变人物/商品身份。",
    "",
    ...strengthenBlock,
    "输出要求：生成一张单图，不要拼图，不要左右对比，不要多版本展示。只输出一张完整图片。",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/** @deprecated Prefer buildReferenceEditPrompt — kept for call-site compatibility. */
export function enhanceReferenceEditPrompt(userPrompt: string): string {
  return buildReferenceEditPrompt(userPrompt);
}

export function strengthenSubjectPreservePrompt(userPrompt: string): string {
  return buildReferenceEditPrompt(userPrompt, { strengthen: true });
}

export function resolveImagePromptForRequest(options: {
  prompt: string;
  hasReferenceImages: boolean;
  strengthen?: boolean;
}): string {
  const trimmed = options.prompt.trim();
  if (!options.hasReferenceImages) return trimmed;
  return buildReferenceEditPrompt(trimmed, {
    strengthen: options.strengthen,
  });
}

/** Prefer stable models for reference edits; fast is fine for text-to-image drafts. */
export const REFERENCE_EDIT_PREFERRED_MODELS = [
  "nano-banana",
  "nano-banana-pro",
  "nano-banana-2",
] as const;

export const TEXT_TO_IMAGE_DEFAULT_MODEL = "nano-banana-fast";

export type ImageModelCapability = {
  supportsReferenceImage: boolean;
  supportsSubjectPreserve: boolean;
  recommendedFor: Array<
    "text_to_image" | "reference_edit" | "ecommerce_product"
  >;
};

export const IMAGE_MODEL_CAPABILITIES: Record<string, ImageModelCapability> = {
  "nano-banana-fast": {
    supportsReferenceImage: true,
    supportsSubjectPreserve: false,
    recommendedFor: ["text_to_image"],
  },
  "nano-banana": {
    supportsReferenceImage: true,
    supportsSubjectPreserve: true,
    recommendedFor: ["reference_edit", "text_to_image"],
  },
  "nano-banana-2": {
    supportsReferenceImage: true,
    supportsSubjectPreserve: true,
    recommendedFor: ["reference_edit", "ecommerce_product", "text_to_image"],
  },
  "nano-banana-pro": {
    supportsReferenceImage: true,
    supportsSubjectPreserve: true,
    recommendedFor: ["reference_edit", "ecommerce_product"],
  },
  "gpt-image-2": {
    supportsReferenceImage: true,
    supportsSubjectPreserve: false,
    recommendedFor: ["text_to_image", "ecommerce_product"],
  },
};

export function getImageModelCapability(
  modelId: string
): ImageModelCapability {
  return (
    IMAGE_MODEL_CAPABILITIES[modelId] ?? {
      supportsReferenceImage: true,
      supportsSubjectPreserve: false,
      recommendedFor: ["text_to_image"],
    }
  );
}

export function pickPreferredImageModel(options: {
  hasReferenceImages: boolean;
  availableModelIds: string[];
  currentModel: string;
  wantsSubjectPreserve?: boolean;
}): {
  model: string;
  switched: boolean;
  warnFastForEdit: boolean;
  blockSubjectPreserve: boolean;
} {
  const {
    hasReferenceImages,
    availableModelIds,
    currentModel,
    wantsSubjectPreserve = false,
  } = options;
  const available = new Set(availableModelIds);
  const needsPreserve = hasReferenceImages || wantsSubjectPreserve;

  if (!needsPreserve) {
    return {
      model: available.has(currentModel)
        ? currentModel
        : available.has(TEXT_TO_IMAGE_DEFAULT_MODEL)
          ? TEXT_TO_IMAGE_DEFAULT_MODEL
          : currentModel,
      switched: false,
      warnFastForEdit: false,
      blockSubjectPreserve: false,
    };
  }

  const preferred = REFERENCE_EDIT_PREFERRED_MODELS.find((id) =>
    available.has(id)
  );
  const currentCapability = getImageModelCapability(currentModel);
  const blockSubjectPreserve =
    wantsSubjectPreserve && !currentCapability.supportsSubjectPreserve;

  if (preferred && currentModel === TEXT_TO_IMAGE_DEFAULT_MODEL) {
    return {
      model: preferred,
      switched: true,
      warnFastForEdit: false,
      blockSubjectPreserve: false,
    };
  }

  if (preferred && blockSubjectPreserve) {
    return {
      model: preferred,
      switched: preferred !== currentModel,
      warnFastForEdit: false,
      blockSubjectPreserve: true,
    };
  }

  if (preferred && !available.has(currentModel)) {
    return {
      model: preferred,
      switched: true,
      warnFastForEdit: false,
      blockSubjectPreserve: false,
    };
  }

  const warnFastForEdit =
    currentModel === TEXT_TO_IMAGE_DEFAULT_MODEL ||
    currentModel.includes("-fast") ||
    !currentCapability.supportsSubjectPreserve;

  return {
    model: available.has(currentModel)
      ? currentModel
      : preferred ?? currentModel,
    switched: !available.has(currentModel) && Boolean(preferred),
    warnFastForEdit,
    blockSubjectPreserve,
  };
}
