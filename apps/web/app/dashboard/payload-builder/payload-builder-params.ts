import type { PayloadBuilderInput } from "./payload-builder-data";

export function parsePayloadBuilderSearchParams(
  searchParams: URLSearchParams
): Partial<PayloadBuilderInput> {
  const partial: Partial<PayloadBuilderInput> = {};
  const industry = searchParams.get("industry");
  const api = searchParams.get("api");
  const model = searchParams.get("model");
  if (
    industry === "hospital" ||
    industry === "auto" ||
    industry === "ecommerce" ||
    industry === "support" ||
    industry === "general"
  ) {
    partial.industry = industry;
  }
  if (api === "chat" || api === "responses" || api === "image" || api === "batch") {
    partial.api = api;
  }
  if (
    model === "auto-fast" ||
    model === "auto-pro" ||
    model === "auto-cheap" ||
    model === "gpt-image-2"
  ) {
    partial.model = model;
  }
  return partial;
}
