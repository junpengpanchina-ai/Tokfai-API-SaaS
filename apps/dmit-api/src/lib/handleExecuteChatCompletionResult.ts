import type { Context } from "hono";

import { ApiError } from "../errors.js";
import type { ExecuteChatCompletionResult } from "./executeChatCompletion.js";

export function respondExecuteChatCompletionFailure(
  c: Context,
  result: ExecuteChatCompletionResult & { ok: false }
): Response {
  if (result.httpStatus === 400) {
    return c.json(
      {
        error: {
          message: result.errorMessage,
          code: result.errorCode,
          type: "invalid_request_error",
        },
        ...(result.suggestedModels?.length
          ? { suggestedModels: result.suggestedModels }
          : {}),
      },
      400
    );
  }
  if (result.httpStatus === 404) {
    throw ApiError.notFound(result.errorMessage, result.errorCode);
  }
  if (result.httpStatus === 402) {
    throw new ApiError({
      status: 402,
      message: result.errorMessage,
      publicMessage: result.errorMessage,
      code: result.errorCode,
      type: "billing_error",
    });
  }
  throw new ApiError({
    status: result.httpStatus,
    message: result.errorMessage,
    publicMessage: result.errorMessage,
    code: result.errorCode,
  });
}
