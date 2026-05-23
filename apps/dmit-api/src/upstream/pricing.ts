import {
  getModelConfig,
  isAllowedModel,
  listAllowedModels,
} from "./modelCatalog.js";

export interface ModelPrice {
  /** USD per 1k input tokens. */
  input_per_1k: number;
  /** USD per 1k output tokens. */
  output_per_1k: number;
}

export { isAllowedModel, listAllowedModels };

export function priceFor(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number;

export function priceFor(
  model: string,
  inputTokens: number,
  outputTokens: number
): number;

export function priceFor(
  inputOrModel:
    | string
    | {
        model: string;
        inputTokens: number;
        outputTokens: number;
      },
  maybeInputTokens?: number,
  maybeOutputTokens?: number
): number {
  const model =
    typeof inputOrModel === "string" ? inputOrModel : inputOrModel.model;

  const inputTokens =
    typeof inputOrModel === "string"
      ? maybeInputTokens ?? 0
      : inputOrModel.inputTokens;

  const outputTokens =
    typeof inputOrModel === "string"
      ? maybeOutputTokens ?? 0
      : inputOrModel.outputTokens;

  const config = getModelConfig(model);

  if (!config || !config.enabled) {
    return 0;
  }

  return (
    (inputTokens / 1000) * config.input_per_1k +
    (outputTokens / 1000) * config.output_per_1k
  );
}
