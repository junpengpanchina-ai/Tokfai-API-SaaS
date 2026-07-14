/**
 * Image workbench vision helpers — recognition vs copywriting are separate.
 * Both use /v1/chat/completions multimodal; never Image API generation.
 */

export type ImageUnderstandUseCaseId =
  | "taobao_pdd"
  | "xiaohongshu"
  | "tiktok_shop"
  | "dtc_detail"
  | "amazon"
  | "livestream"
  | "private_domain"
  | "portrait_formal"
  | "general";

export type CopywritingUseCaseId =
  | "product_title"
  | "product_bullets"
  | "xiaohongshu"
  | "tiktok_shop"
  | "amazon_dtc"
  | "feed_ads"
  | "livestream"
  | "private_domain"
  | "general";

export type EcommerceWorkbenchMode =
  | "ecommerce_image_analysis"
  | "product_copy"
  | "image_generate";

export const ECOMMERCE_VISION_MODEL_IDS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gpt-5.4",
  "gpt-5.5",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

export const ECOMMERCE_VISION_DEFAULT_MODEL = "gemini-2.5-flash";

export type EcommerceUseCaseId = ImageUnderstandUseCaseId;

export const IMAGE_UNDERSTAND_USE_CASES: Array<{
  id: ImageUnderstandUseCaseId;
  labelZh: string;
  labelEn: string;
}> = [
  { id: "taobao_pdd", labelZh: "淘宝/拼多多商品图", labelEn: "Taobao / PDD listing" },
  { id: "xiaohongshu", labelZh: "小红书种草图", labelEn: "Xiaohongshu seeding" },
  { id: "tiktok_shop", labelZh: "TikTok Shop 素材", labelEn: "TikTok Shop creative" },
  { id: "dtc_detail", labelZh: "独立站详情页", labelEn: "DTC detail page" },
  { id: "amazon", labelZh: "Amazon 商品图", labelEn: "Amazon listing image" },
  { id: "livestream", labelZh: "直播带货素材", labelEn: "Livestream commerce" },
  {
    id: "private_domain",
    labelZh: "私域朋友圈素材",
    labelEn: "Private-domain Moments",
  },
  {
    id: "portrait_formal",
    labelZh: "人物形象/职业照",
    labelEn: "Portrait / professional photo",
  },
  { id: "general", labelZh: "通用电商素材", labelEn: "General ecommerce asset" },
];

export const COPYWRITING_USE_CASES: Array<{
  id: CopywritingUseCaseId;
  labelZh: string;
  labelEn: string;
}> = [
  { id: "product_title", labelZh: "商品标题", labelEn: "Product titles" },
  { id: "product_bullets", labelZh: "商品卖点", labelEn: "Selling points" },
  { id: "xiaohongshu", labelZh: "小红书种草文案", labelEn: "Xiaohongshu seeding copy" },
  { id: "tiktok_shop", labelZh: "TikTok Shop 文案", labelEn: "TikTok Shop copy" },
  {
    id: "amazon_dtc",
    labelZh: "Amazon / 独立站详情页",
    labelEn: "Amazon / DTC detail page",
  },
  { id: "feed_ads", labelZh: "信息流广告文案", labelEn: "Feed ad copy" },
  { id: "livestream", labelZh: "直播带货话术", labelEn: "Livestream scripts" },
  {
    id: "private_domain",
    labelZh: "私域朋友圈文案",
    labelEn: "Private-domain Moments copy",
  },
  { id: "general", labelZh: "通用电商文案", labelEn: "General ecommerce copy" },
];

export const ECOMMERCE_USE_CASES = IMAGE_UNDERSTAND_USE_CASES;

const UNDERSTAND_HINT: Record<ImageUnderstandUseCaseId, string> = {
  taobao_pdd:
    "淘宝/拼多多商品图：关注主图卖点、价格感、人群、详情页转化与平台合规风险。",
  xiaohongshu: "小红书种草图：关注生活方式、真实感、种草钩子与标签方向。",
  tiktok_shop: "TikTok Shop：关注短视频封面/素材钩子、节奏与转化卖点。",
  dtc_detail: "独立站详情页：关注品牌感、信任背书与转化段落方向。",
  amazon: "Amazon listing：关注白底/场景图规范、属性卖点与合规措辞。",
  livestream: "直播带货：关注讲解话术切入点、逼单卖点与演示印象。",
  private_domain: "私域朋友圈：关注口语化种草与转发动机。",
  portrait_formal: "人物形象/职业照：关注着装、气质、场景与人设卖点。",
  general: "通用电商素材：围绕图片真实内容做识别与售卖建议。",
};

const COPY_HINT: Record<CopywritingUseCaseId, string> = {
  product_title: "重点输出可上架的商品标题，覆盖搜索词与卖点。",
  product_bullets: "重点输出清晰可勾选的商品卖点 bullet。",
  xiaohongshu: "重点输出小红书种草口吻：标题、正文、标签。",
  tiktok_shop: "重点输出 TikTok Shop 短视频钩子与转化文案。",
  amazon_dtc: "重点输出 Amazon / 独立站标题、bullet points 与详情页段落。",
  feed_ads: "重点输出信息流广告主文案、CTA 与多套 A/B。",
  livestream: "重点输出直播开场钩子、讲解与逼单话术。",
  private_domain: "重点输出私域朋友圈文案，口语自然可转发。",
  general: "按通用电商运营文案输出。",
};

/** Smoke / demo strings that must never ship in consumer workbench requests. */
export const IMAGE_WORKBENCH_SMOKE_PROMPT_MARKERS = [
  "futuristic API dashboard",
  "API dashboard",
  "clean product-style image of a futuristic",
  "Tokfai API integration smoke",
] as const;

export function isImageWorkbenchSmokePrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;
  return IMAGE_WORKBENCH_SMOKE_PROMPT_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase())
  );
}

function buildUnderstandPrompt(options: {
  useCase: ImageUnderstandUseCaseId;
  useCaseLabel: string;
  extraNeed?: string;
}): string {
  const hint = UNDERSTAND_HINT[options.useCase];
  const extra = options.extraNeed?.trim();

  return [
    "你是一名电商图片识别专家。",
    "用户已上传一张真实图片。你必须先看图，再围绕该图片本身输出分析。",
    "图片是唯一事实来源：只描述你在图片中实际看到的内容，禁止编造未出现的商品、颜色、材质、人物或场景。",
    "不要生成或修改图片。不要输出与图片无关的泛文案、通用营销模板或测试文案。",
    "",
    "只输出以下结构（全部必须紧扣图片）：",
    "1. 图片内容（主体、颜色、材质、构图、可见文字/包装）",
    "2. 商品类型 / 人物 / 场景判断",
    "3. 目标人群",
    "4. 可提炼卖点（必须能从图片证据推出）",
    "5. 风险与注意事项（合规、误导、画质、侵权等）",
    "6. 平台建议（结合当前用途）",
    "7. 下一步建议（可提示去「写商品文案」；不要给换图/改图/生成图指令）",
    "",
    "禁止：",
    "- 不要输出与图片无关的长篇营销正文或标题矩阵",
    "- 不要建议换背景、换服装、生成新图、改图",
    "- 不要写 API、模型、接口或技术解释",
    "- 不要使用任何默认测试 prompt 或演示文案",
    "",
    "输出要求：用中文，分段清晰；看不清时明确写“不确定”。",
    "",
    `当前用途（必须对齐）：${options.useCaseLabel}`,
    `用途说明：${hint}`,
    extra
      ? `用户补充说明（必须纳入分析）：${extra}`
      : "用户未补充额外说明。",
  ].join("\n");
}

function buildCopywritingPrompt(options: {
  useCase: CopywritingUseCaseId;
  useCaseLabel: string;
  extraNeed?: string;
  hasImage: boolean;
}): string {
  const hint = COPY_HINT[options.useCase];
  const extra = options.extraNeed?.trim();

  if (!options.hasImage) {
    return [
      "你是一名电商文案与内容运营专家。",
      "未上传图片，以下基于文字需求生成。",
      "请在结果开头第一行明确写：【未上传图片，以下基于文字需求生成】",
      "不要假装看过图片，不要编造图片细节。",
      "",
      "严格遵守：",
      "1. 只输出文案结果",
      "2. 必须服从用户用途与补充需求",
      "3. 不要建议换图/改图/生成图，除非用户明确要求",
      "4. 不要写技术解释",
      "",
      "输出结构：",
      "- 标题 5 条",
      "- 核心卖点 5 条",
      "- 正文文案 3 版",
      "- 短视频口播 1 版",
      "- 广告短句 10 条",
      "- 适合平台建议",
      "",
      `当前文案用途：${options.useCaseLabel}`,
      `用途说明：${hint}`,
      extra
        ? `用户文字需求（必须优先服从）：${extra}`
        : "用户未补充文字需求。请基于用途给出可落地的电商文案框架，并提示用户补充商品信息。",
    ].join("\n");
  }

  return [
    "你是一名电商文案与内容运营专家。",
    "用户上传了真实图片。你必须先基于图片做结构化理解，再写文案。",
    "",
    "第一步（内心完成，不要单独输出长报告）：识别图片中的主体、颜色、材质、包装/文字、场景、人物着装等真实元素。",
    "第二步：结合用途与补充需求，直接输出可复制的商品文案。",
    "",
    "严格遵守：",
    "1. 文案必须引用图片里的真实元素（颜色、款式、材质、场景、人物气质等至少 3 处）",
    "2. 不要输出与图片无关的泛泛而谈",
    "3. 不要编造图片中不存在的卖点",
    "4. 只输出文案结果，不要输出冗长图片拆解报告",
    "5. 不要建议换图、改图、生成图，除非用户明确要求",
    "6. 不要写技术解释",
    "",
    "输出结构：",
    "- 标题 5 条（贴合用途与图片）",
    "- 核心卖点 5 条（每条能对应图片证据）",
    "- 正文文案 3 版",
    "- 短视频口播 1 版",
    "- 广告短句 10 条",
    "- 适合平台建议",
    "",
    `当前文案用途：${options.useCaseLabel}`,
    `用途说明：${hint}`,
    extra
      ? `用户补充需求（必须优先服从）：${extra}`
      : "用户未补充额外需求。",
  ].join("\n");
}

export function buildEcommerceVisionPrompt(options: {
  mode: "ecommerce_image_analysis" | "product_copy";
  useCase: string;
  extraNeed?: string;
  /** When false in product_copy mode, generate from text only. */
  hasImage?: boolean;
}): string {
  if (options.mode === "product_copy") {
    const useCase =
      (options.useCase as CopywritingUseCaseId) || "xiaohongshu";
    const label =
      COPYWRITING_USE_CASES.find((item) => item.id === useCase)?.labelZh ??
      useCase;
    return buildCopywritingPrompt({
      useCase,
      useCaseLabel: label,
      extraNeed: options.extraNeed,
      hasImage: options.hasImage !== false,
    });
  }

  const useCase =
    (options.useCase as ImageUnderstandUseCaseId) || "general";
  const label =
    IMAGE_UNDERSTAND_USE_CASES.find((item) => item.id === useCase)?.labelZh ??
    useCase;
  return buildUnderstandPrompt({
    useCase,
    useCaseLabel: label,
    extraNeed: options.extraNeed,
  });
}

export function pickEcommerceVisionModel(preferred?: string | null): string {
  if (
    preferred &&
    (ECOMMERCE_VISION_MODEL_IDS as readonly string[]).includes(preferred)
  ) {
    return preferred;
  }
  return ECOMMERCE_VISION_DEFAULT_MODEL;
}

export function ecommerceUseCaseLabel(
  id: string,
  locale: "en" | "zh",
  mode: "ecommerce_image_analysis" | "product_copy" = "ecommerce_image_analysis"
): string {
  const list =
    mode === "product_copy" ? COPYWRITING_USE_CASES : IMAGE_UNDERSTAND_USE_CASES;
  const entry = list.find((item) => item.id === id);
  if (!entry) return id;
  return locale === "zh" ? entry.labelZh : entry.labelEn;
}

export function defaultUseCaseForMode(
  mode: "ecommerce_image_analysis" | "product_copy"
): string {
  return mode === "product_copy" ? "xiaohongshu" : "taobao_pdd";
}

export function useCasesForMode(
  mode: "ecommerce_image_analysis" | "product_copy"
): Array<{ id: string; labelZh: string; labelEn: string }> {
  return mode === "product_copy"
    ? COPYWRITING_USE_CASES
    : IMAGE_UNDERSTAND_USE_CASES;
}
