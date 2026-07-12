/**
 * Ecommerce image analysis — vision chat prompts and model selection.
 * Uses /v1/chat/completions multimodal (not Image API generation).
 */

export type EcommerceUseCaseId =
  | "taobao_pdd"
  | "tiktok_shop"
  | "amazon_dtc"
  | "xiaohongshu"
  | "feed_ads"
  | "livestream"
  | "medical_aesthetic"
  | "general";

export type EcommerceWorkbenchMode =
  | "ecommerce_image_analysis"
  | "product_copy"
  | "image_generate";

/** Vision-capable chat models (prefer these for image understanding). */
export const ECOMMERCE_VISION_MODEL_IDS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gpt-5.4",
  "gpt-5.5",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

export const ECOMMERCE_VISION_DEFAULT_MODEL = "gemini-2.5-flash";

export const ECOMMERCE_USE_CASES: Array<{
  id: EcommerceUseCaseId;
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

const USE_CASE_HINT: Record<EcommerceUseCaseId, string> = {
  taobao_pdd: "重点输出适合淘宝/拼多多的标题、主图卖点与详情页文案。",
  tiktok_shop: "重点输出适合 TikTok Shop 的短视频脚本钩子与转化文案。",
  amazon_dtc: "重点输出适合 Amazon / 独立站的英文标题、bullet points 与 listing 结构（可用中英对照）。",
  xiaohongshu: "重点输出小红书种草口吻：标题、正文、标签与种草节奏。",
  feed_ads: "重点输出信息流广告：主文案、行动号召、多套 A/B 文案。",
  livestream: "重点输出直播话术：开场钩子、讲解卖点、逼单话术。",
  medical_aesthetic:
    "重点识别是否涉及医疗/功效承诺，给出合规风险提示，文案避免夸大疗效。",
  general: "按通用电商运营场景输出结构化结果。",
};

function buildBaseAnalysisPrompt(options: {
  useCase: EcommerceUseCaseId;
  extraNeed?: string;
}): string {
  const hint = USE_CASE_HINT[options.useCase];
  const extra = options.extraNeed?.trim();

  return [
    "你是一名电商图片分析与内容运营专家。",
    "请基于用户上传的图片进行识别和拆解，输出结构化结果。",
    "",
    "请分析：",
    "1. 图片主体是什么",
    "2. 商品类型 / 场景 / 人群",
    "3. 可见卖点",
    "4. 潜在购买动机",
    "5. 适合的平台",
    "6. 标题建议",
    "7. 商品卖点文案",
    "8. 短视频 / 图文种草文案",
    "9. 投放广告文案",
    "10. 图片优化建议",
    "11. 风险提示：是否存在夸大、侵权、医疗/功效承诺、敏感元素",
    "",
    "输出要求：",
    "- 用中文",
    "- 分段清晰，使用编号标题",
    "- 不要写技术解释",
    "- 直接给运营可用结果",
    "- 如果图片内容不清晰，要说明不确定点",
    "",
    `当前用途：${hint}`,
    extra ? `用户补充需求：${extra}` : "用户未补充额外需求。",
  ].join("\n");
}

function buildCopyPrompt(options: {
  useCase: EcommerceUseCaseId;
  extraNeed?: string;
}): string {
  const hint = USE_CASE_HINT[options.useCase];
  const extra = options.extraNeed?.trim();

  return [
    "你是一名电商内容运营专家。",
    "请基于用户上传的商品图，直接产出可投放、可上架的文案结果。",
    "",
    "请输出：",
    "1. 商品识别结论（一句话）",
    "2. 标题建议（至少 5 条）",
    "3. 核心卖点（bullet，至少 5 条）",
    "4. 详情页短文案",
    "5. 种草图文文案",
    "6. 短视频口播稿",
    "7. 信息流广告文案（至少 3 套）",
    "8. 行动号召（CTA）",
    "9. 风险提示（夸大、功效、敏感词）",
    "",
    "输出要求：",
    "- 用中文",
    "- 分段清晰",
    "- 不要写技术解释",
    "- 文案可直接复制使用",
    "",
    `当前用途：${hint}`,
    extra ? `用户补充需求：${extra}` : "用户未补充额外需求。",
  ].join("\n");
}

export function buildEcommerceVisionPrompt(options: {
  mode: "ecommerce_image_analysis" | "product_copy";
  useCase: EcommerceUseCaseId;
  extraNeed?: string;
}): string {
  if (options.mode === "product_copy") {
    return buildCopyPrompt(options);
  }
  return buildBaseAnalysisPrompt(options);
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
  id: EcommerceUseCaseId,
  locale: "en" | "zh"
): string {
  const entry = ECOMMERCE_USE_CASES.find((item) => item.id === id);
  if (!entry) return id;
  return locale === "zh" ? entry.labelZh : entry.labelEn;
}
