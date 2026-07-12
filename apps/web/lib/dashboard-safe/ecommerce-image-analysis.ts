/**
 * Image workbench vision helpers — understand-image vs copywriting are separate.
 * Both use /v1/chat/completions multimodal; never Image API generation.
 */

export type ImageUnderstandUseCaseId =
  | "taobao_pdd"
  | "tiktok_shop"
  | "amazon_dtc"
  | "xiaohongshu"
  | "feed_ads"
  | "livestream"
  | "medical_aesthetic"
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

/** Vision-capable chat models (never image-generation models). */
export const ECOMMERCE_VISION_MODEL_IDS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gpt-5.4",
  "gpt-5.5",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

export const ECOMMERCE_VISION_DEFAULT_MODEL = "gemini-2.5-flash";

/** @deprecated Use IMAGE_UNDERSTAND_USE_CASES — kept for type aliases. */
export type EcommerceUseCaseId = ImageUnderstandUseCaseId;

export const IMAGE_UNDERSTAND_USE_CASES: Array<{
  id: ImageUnderstandUseCaseId;
  labelZh: string;
  labelEn: string;
}> = [
  { id: "taobao_pdd", labelZh: "淘宝/拼多多商品图", labelEn: "Taobao / PDD listing" },
  { id: "tiktok_shop", labelZh: "TikTok Shop", labelEn: "TikTok Shop" },
  { id: "amazon_dtc", labelZh: "Amazon / 独立站", labelEn: "Amazon / DTC" },
  { id: "xiaohongshu", labelZh: "小红书种草", labelEn: "Xiaohongshu seeding" },
  { id: "feed_ads", labelZh: "信息流广告", labelEn: "Feed ads" },
  { id: "livestream", labelZh: "直播带货素材", labelEn: "Livestream commerce" },
  {
    id: "medical_aesthetic",
    labelZh: "医美/医疗素材",
    labelEn: "Medical / aesthetic",
  },
  { id: "general", labelZh: "通用商品分析", labelEn: "General product" },
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

/** @deprecated Prefer IMAGE_UNDERSTAND_USE_CASES */
export const ECOMMERCE_USE_CASES = IMAGE_UNDERSTAND_USE_CASES;

const UNDERSTAND_HINT: Record<ImageUnderstandUseCaseId, string> = {
  taobao_pdd: "关注淘宝/拼多多主图与详情页适用场景。",
  tiktok_shop: "关注短视频带货与 TikTok Shop 场景。",
  amazon_dtc: "关注 Amazon / 独立站 listing 场景。",
  xiaohongshu: "关注小红书种草内容场景。",
  feed_ads: "关注信息流广告投放场景。",
  livestream: "关注直播讲解与逼单场景。",
  medical_aesthetic: "重点识别医疗/功效承诺与合规风险。",
  general: "按通用电商素材识别。",
};

const COPY_HINT: Record<CopywritingUseCaseId, string> = {
  product_title: "重点输出可上架的商品标题，覆盖搜索词与卖点。",
  product_bullets: "重点输出清晰可勾选的商品卖点 bullet。",
  xiaohongshu: "重点输出小红书种草口吻：标题、正文、标签。",
  tiktok_shop: "重点输出 TikTok Shop 短视频钩子与转化文案。",
  amazon_dtc: "重点输出 Amazon / 独立站标题、bullet points 与详情页段落（可用中英对照）。",
  feed_ads: "重点输出信息流广告主文案、CTA 与多套 A/B。",
  livestream: "重点输出直播开场钩子、讲解与逼单话术。",
  private_domain: "重点输出私域朋友圈文案，口语自然可转发。",
  general: "按通用电商运营文案输出。",
};

function buildUnderstandPrompt(options: {
  useCase: ImageUnderstandUseCaseId;
  extraNeed?: string;
}): string {
  const hint = UNDERSTAND_HINT[options.useCase];
  const extra = options.extraNeed?.trim();

  return [
    "你是一名电商图片识别专家。",
    "请基于用户上传的图片做内容识别与拆解。图片只是输入素材，不要生成或修改图片。",
    "",
    "只输出以下结构：",
    "1. 图片主体",
    "2. 商品/人物/场景判断",
    "3. 可见卖点",
    "4. 适合平台",
    "5. 风险提示（夸大、侵权、医疗/功效承诺、敏感元素）",
    "6. 下一步建议（只给运营动作建议，例如可继续去生成文案；不要给换图/改图/生成图指令）",
    "",
    "禁止：",
    "- 不要输出长篇营销文案、标题矩阵、广告短句",
    "- 不要建议换背景、换服装、生成新图、改图",
    "- 不要写技术解释",
    "",
    "输出要求：用中文，分段清晰；图片不清晰时说明不确定点。",
    "",
    `当前用途：${hint}`,
    extra ? `用户补充说明：${extra}` : "用户未补充额外说明。",
  ].join("\n");
}

function buildCopywritingPrompt(options: {
  useCase: CopywritingUseCaseId;
  extraNeed?: string;
}): string {
  const hint = COPY_HINT[options.useCase];
  const extra = options.extraNeed?.trim();

  return [
    "你是一名电商文案与内容运营专家。",
    "用户会上传一张商品图、人物图或电商素材图，并说明想要的文案用途。",
    "你的任务不是修改图片，也不是生成图片，而是基于图片信息和用户需求，直接输出可复制使用的文案。",
    "",
    "请严格遵守：",
    "1. 只输出文案结果",
    "2. 不要说“我看到了图片里有什么”太多",
    "3. 不要输出图片拆解报告",
    "4. 不要建议换图、改图、生成图，除非用户明确要求",
    "5. 不要写技术解释",
    "6. 文案要能直接复制给运营使用",
    "7. 如果图片是人物图，要根据用户需求判断是写服装文案、形象照文案、职场人设文案还是广告文案",
    "8. 如果用户补充需求写了“做西装文案”，就围绕西装/正装/职业形象写文案，不要跑去分析人物本身",
    "",
    "输出结构：",
    "- 标题 5 条",
    "- 核心卖点 5 条",
    "- 正文文案 3 版",
    "- 短视频口播 1 版",
    "- 广告短句 10 条",
    "- 适合平台建议",
    "- 可直接复制版本",
    "",
    `当前文案用途：${hint}`,
    extra
      ? `用户补充需求（必须优先服从）：${extra}`
      : "用户未补充额外需求。",
  ].join("\n");
}

export function buildEcommerceVisionPrompt(options: {
  mode: "ecommerce_image_analysis" | "product_copy";
  useCase: string;
  extraNeed?: string;
}): string {
  if (options.mode === "product_copy") {
    return buildCopywritingPrompt({
      useCase: (options.useCase as CopywritingUseCaseId) || "xiaohongshu",
      extraNeed: options.extraNeed,
    });
  }
  return buildUnderstandPrompt({
    useCase: (options.useCase as ImageUnderstandUseCaseId) || "general",
    extraNeed: options.extraNeed,
  });
}

export function pickEcommerceVisionModel(
  preferred?: string | null
): string {
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
