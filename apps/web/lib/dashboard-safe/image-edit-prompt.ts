/**
 * Image Playground prompt helpers — text-to-image vs reference-image edit mode.
 * Client-only prompt shaping; does not change DMIT Image API contracts.
 * Upstream field for reference images remains `image_urls` (not `images`).
 */

/** Explicit edit / preserve intent — used to require a reference image. */
const REFERENCE_EDIT_INTENT_PATTERN =
  /保留人物|保留主体|保留脸|不要换人|保持人物|只换衣服|换背景|换服装|换风格|参考图|按原图|照着这张|保留商品|不要换脸|同一张脸|基于原图|局部改图|改图|换成|替换成|改成/;

/** Softer hints that still benefit from subject-preserve wrapping when images exist. */
const EDIT_HINT_PATTERN =
  /保留|替换|换成|改成|变成|参考|保持|主体|脸|人物|衣服|背景|西装|中山装|服装|发型|姿态|构图|龙袍|商品|白底/;

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

function extractClothingChange(prompt: string): string | null {
  const match = prompt.match(
    /(?:把|将)?(.{0,12}?)(?:西装|西服|外套|衣服|服装|上衣|裙子|礼服|T恤|衬衫|裤子|鞋子)?(?:换成|替换成|改成|变成)(.{1,40}?)(?:[，。,.！!？?\n]|$)/
  );
  if (!match) return null;
  const from = (match[1] || match[0]).trim();
  const to = match[2]?.trim();
  if (!to) return null;
  if (/西装|西服|外套|衣服|服装/.test(prompt) || from) {
    const polishedTo = /龙袍/.test(to) && !/中式/.test(to) ? `精致的中式${to}` : to;
    return `只把他/她身上的服装替换成：${polishedTo}。不要改脸、发型、体型、姿态或人物身份。`;
  }
  return `只按要求替换服装为：${to}。不要改脸、发型、体型、姿态或人物身份。`;
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

/**
 * Wrap user prompt for reference-image edit so the model edits locally
 * instead of inventing a new subject.
 */
export function buildReferenceEditPrompt(
  userPrompt: string,
  options: BuildReferenceEditPromptOptions = {}
): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return trimmed;

  const strengthen = options.strengthen === true;
  const clothing = extractClothingChange(trimmed);
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
  if (clothing) changeLines.push(clothing);
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

export function pickPreferredImageModel(options: {
  hasReferenceImages: boolean;
  availableModelIds: string[];
  currentModel: string;
}): { model: string; switched: boolean; warnFastForEdit: boolean } {
  const { hasReferenceImages, availableModelIds, currentModel } = options;
  const available = new Set(availableModelIds);

  if (!hasReferenceImages) {
    return {
      model: available.has(currentModel)
        ? currentModel
        : available.has(TEXT_TO_IMAGE_DEFAULT_MODEL)
          ? TEXT_TO_IMAGE_DEFAULT_MODEL
          : currentModel,
      switched: false,
      warnFastForEdit: false,
    };
  }

  const preferred = REFERENCE_EDIT_PREFERRED_MODELS.find((id) =>
    available.has(id)
  );

  if (preferred && currentModel === TEXT_TO_IMAGE_DEFAULT_MODEL) {
    return { model: preferred, switched: true, warnFastForEdit: false };
  }

  if (preferred && !available.has(currentModel)) {
    return { model: preferred, switched: true, warnFastForEdit: false };
  }

  const warnFastForEdit =
    currentModel === TEXT_TO_IMAGE_DEFAULT_MODEL ||
    currentModel.includes("-fast");

  return {
    model: available.has(currentModel)
      ? currentModel
      : preferred ?? currentModel,
    switched: !available.has(currentModel) && Boolean(preferred),
    warnFastForEdit,
  };
}
