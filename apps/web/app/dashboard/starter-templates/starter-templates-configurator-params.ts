import type { TemplateConfiguratorInput } from "@/lib/customer-template-configurator";

export { TEMPLATE_CONFIGURATOR_PATH } from "./starter-templates-display-helpers";

export function parseConfiguratorSearchParams(
  searchParams: URLSearchParams
): Partial<TemplateConfiguratorInput> {
  const industry = searchParams.get("industry");
  const api = searchParams.get("api");
  const language = searchParams.get("language");
  const model = searchParams.get("model");
  const workload = searchParams.get("workload");

  const partial: Partial<TemplateConfiguratorInput> = {};
  if (
    industry === "hospital" ||
    industry === "auto" ||
    industry === "ecommerce" ||
    industry === "support" ||
    industry === "general"
  ) {
    partial.industry = industry;
  }
  if (
    api === "chat" ||
    api === "responses" ||
    api === "image" ||
    api === "batch"
  ) {
    partial.api = api;
  }
  if (
    language === "curl" ||
    language === "powershell" ||
    language === "node" ||
    language === "python"
  ) {
    partial.language = language;
  }
  if (
    model === "auto-fast" ||
    model === "auto-pro" ||
    model === "auto-cheap" ||
    model === "gpt-image-2"
  ) {
    partial.model = model;
  }
  if (
    workload === "single" ||
    workload === "small-batch" ||
    workload === "large-batch"
  ) {
    partial.workloadSize = workload;
  }
  return partial;
}
