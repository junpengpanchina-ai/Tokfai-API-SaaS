/**
 * Dashboard image generations — sk-tokfai API key auth, no Supabase client.
 */

import { DashboardDmitApiError, dashboardDmitFetchWithHeaders } from "./dmit-fetch";

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
  response_format?: "url";
  mode?: "text_to_image" | "reference_edit";
  /** Preferred field — data URLs or http(s) URLs for upstream `images`. */
  images?: string[];
  /** Legacy alias still accepted by DMIT. */
  image_urls?: string[];
}

export interface ImageGenerationDataItem {
  url?: string;
  b64_json?: string;
}

export type ImageUrlResolveSource =
  | "direct"
  | "data_url"
  | "google_imgres"
  | "html_og_image"
  | "html_twitter_image"
  | "html_first_image";

export interface ImageGenerationResponse {
  created: number;
  data: ImageGenerationDataItem[];
  model: string;
  request_id?: string;
  upstream_id?: string;
  credits_charged?: number;
  mode?: "text_to_image" | "reference_edit";
  prompt_mode?: "subject_preserve" | "normal";
  reference_image_included?: boolean;
  images_count?: number;
  input_images_count?: number;
  resolved_images_count?: number;
  upstream_images_count?: number;
  image_source_type?: "data_url" | "https_url" | "blob_blocked" | "none";
  image_url_sources?: ImageUrlResolveSource[];
}

export { DashboardDmitApiError as DmitApiError };

export async function imageGenerations(
  apiKey: string,
  body: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  if (!apiKey) {
    throw new DashboardDmitApiError({
      status: 400,
      message: "Missing API key.",
      code: "no_api_key",
    });
  }
  const res = await dashboardDmitFetchWithHeaders<ImageGenerationResponse>(
    "/v1/images/generations",
    {
      method: "POST",
      json: body,
      accessToken: apiKey,
    }
  );
  const requestId = res.headers.get("x-request-id");
  if (!requestId) return res.data;
  return {
    ...res.data,
    request_id: res.data.request_id ?? requestId,
  };
}
