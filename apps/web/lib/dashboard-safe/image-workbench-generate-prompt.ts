/**
 * Assemble consumer image-workbench generation prompts from purpose / style /
 * extra notes. Never injects smoke/demo defaults.
 */

import { isImageWorkbenchSmokePrompt } from "./ecommerce-image-analysis";
import { resolveImagePromptForRequest } from "./image-edit-prompt";

export type ImageGeneratePurposeId =
  | "taobao_main"
  | "pdd_main"
  | "xiaohongshu"
  | "detail_page"
  | "poster"
  | "avatar"
  | "reference_edit"
  | "general";

export type ImageGenerateStyleId =
  | "white_bg"
  | "studio"
  | "lifestyle"
  | "minimal"
  | "premium"
  | "natural";

export const IMAGE_GENERATE_PURPOSES: Array<{
  id: ImageGeneratePurposeId;
  labelZh: string;
  labelEn: string;
  promptHint: string;
}> = [
  {
    id: "taobao_main",
    labelZh: "淘宝主图",
    labelEn: "Taobao hero",
    promptHint: "淘宝电商主图，突出商品卖点，适合列表页点击",
  },
  {
    id: "pdd_main",
    labelZh: "拼多多主图",
    labelEn: "PDD hero",
    promptHint: "拼多多电商主图，卖点清晰、价格感强",
  },
  {
    id: "xiaohongshu",
    labelZh: "小红书种草图",
    labelEn: "Xiaohongshu",
    promptHint: "小红书种草风格，真实生活感与分享欲",
  },
  {
    id: "detail_page",
    labelZh: "详情页场景图",
    labelEn: "Detail scene",
    promptHint: "详情页场景图，帮助用户理解使用场景",
  },
  {
    id: "poster",
    labelZh: "海报宣传图",
    labelEn: "Poster",
    promptHint: "商业海报构图，预留标题空间",
  },
  {
    id: "avatar",
    labelZh: "头像/形象照",
    labelEn: "Avatar",
    promptHint: "人物形象照/头像，干净专业",
  },
  {
    id: "reference_edit",
    labelZh: "参考图改图",
    labelEn: "Reference edit",
    promptHint: "基于参考图做局部修改，保留主体",
  },
  {
    id: "general",
    labelZh: "通用生成",
    labelEn: "General",
    promptHint: "按用户描述生成电商相关图片",
  },
];

export const IMAGE_GENERATE_STYLES: Array<{
  id: ImageGenerateStyleId;
  labelZh: string;
  labelEn: string;
  promptHint: string;
}> = [
  {
    id: "white_bg",
    labelZh: "干净白底",
    labelEn: "White background",
    promptHint: "干净白底棚拍，商品居中",
  },
  {
    id: "studio",
    labelZh: "棚拍商业光",
    labelEn: "Studio lighting",
    promptHint: "商业棚拍布光，质感清晰",
  },
  {
    id: "lifestyle",
    labelZh: "生活场景",
    labelEn: "Lifestyle",
    promptHint: "真实生活使用场景",
  },
  {
    id: "minimal",
    labelZh: "极简留白",
    labelEn: "Minimal",
    promptHint: "极简构图，大量留白",
  },
  {
    id: "premium",
    labelZh: "高端质感",
    labelEn: "Premium",
    promptHint: "高端质感、细腻材质表现",
  },
  {
    id: "natural",
    labelZh: "自然真实",
    labelEn: "Natural",
    promptHint: "自然光、真实纪实感",
  },
];

export function defaultGeneratePurpose(
  hasReferenceImages: boolean
): ImageGeneratePurposeId {
  return hasReferenceImages ? "reference_edit" : "taobao_main";
}

/**
 * Build the final prompt for /v1/images/generations from structured user input.
 * Returns null when there is nothing usable (caller should block submit).
 */
export function buildImageWorkbenchGeneratePrompt(options: {
  purpose: ImageGeneratePurposeId | string;
  style: ImageGenerateStyleId | string;
  extraNeed?: string;
  hasReferenceImages: boolean;
  strengthen?: boolean;
}): { prompt: string; userVisibleSummary: string } | null {
  const purpose =
    IMAGE_GENERATE_PURPOSES.find((item) => item.id === options.purpose) ??
    IMAGE_GENERATE_PURPOSES.find((item) => item.id === "general")!;
  const style =
    IMAGE_GENERATE_STYLES.find((item) => item.id === options.style) ??
    IMAGE_GENERATE_STYLES.find((item) => item.id === "studio")!;
  const extra = options.extraNeed?.trim() ?? "";

  if (!extra && !options.hasReferenceImages) {
    // Need at least user notes for text-to-image.
    return null;
  }

  const parts = [
    `用途：${purpose.promptHint}`,
    `风格：${style.promptHint}`,
    extra ? `用户补充需求：${extra}` : null,
    options.hasReferenceImages
      ? "请基于用户上传的参考图进行改图/编辑，保留参考图主体，仅按用户需求修改。"
      : "请根据上述用途、风格与补充需求生成一张电商可用图片。",
    "禁止生成与用户需求无关的 API 后台、dashboard、测试插画或演示内容。",
  ].filter(Boolean) as string[];

  const assembled = parts.join("\n");
  if (isImageWorkbenchSmokePrompt(assembled)) {
    return null;
  }

  const prompt = resolveImagePromptForRequest({
    prompt: assembled,
    hasReferenceImages: options.hasReferenceImages,
    strengthen: options.strengthen,
  });

  if (!prompt.trim() || isImageWorkbenchSmokePrompt(prompt)) {
    return null;
  }

  return {
    prompt,
    userVisibleSummary: assembled,
  };
}
