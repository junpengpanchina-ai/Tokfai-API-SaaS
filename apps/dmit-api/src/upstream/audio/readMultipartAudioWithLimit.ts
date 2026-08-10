/**
 * Bounded multipart audio reader for POST /v1/audio/transcriptions (P1079R2).
 *
 * Guarantees:
 * - Content-Length early reject before buffering when present
 * - Hard byte cap while streaming the body (chunked / missing CL)
 * - Never unbounded buffering of attacker-controlled uploads
 *
 * Memory note: after a successful capped read, the full (bounded) multipart
 * body resides once in a Buffer for FormData parse; file bytes become a
 * Uint8Array view/copy of the file part. This is B_SINGLE_FULL_BUFFER for the
 * ingress path — not true streaming inference passthrough.
 */

import { ApiError } from "../../errors.js";

/** Multipart envelope overhead above the raw audio file (fields + boundary). */
export const STT_MULTIPART_OVERHEAD_SLACK_BYTES = 256 * 1024;

export const DEFAULT_STT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type ParsedSttMultipart = {
  model: string;
  language?: string;
  prompt?: string;
  responseFormat?: string;
  temperature?: number;
  filename: string;
  mimeType: string;
  /** File bytes only — not the whole multipart envelope. */
  bytes: Uint8Array;
  /** Total raw request body bytes buffered (≤ maxBodyBytes). */
  rawBodyBytes: number;
  /** True when Content-Length was present and used for early reject. */
  contentLengthChecked: boolean;
};

function basenameOnly(name: string): string {
  const cleaned = name.replace(/\\/g, "/").split("/").pop() || "audio.wav";
  return cleaned.slice(0, 128);
}

export function resolveSttMaxUploadBytes(
  raw: string | undefined,
  fallback = DEFAULT_STT_MAX_UPLOAD_BYTES
): number {
  if (raw == null || !String(raw).trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1024 || n > 100 * 1024 * 1024) {
    return fallback;
  }
  return Math.trunc(n);
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // ignore
  }
}

/**
 * Read + parse multipart with a hard body byte limit.
 * Throws ApiError payloadTooLarge (413) / badRequest (400).
 */
export async function readMultipartAudioWithLimit(args: {
  contentType: string;
  contentLengthHeader: string | undefined;
  body: ReadableStream<Uint8Array> | null;
  maxFileBytes: number;
  /** Abort when the consumer disconnects. */
  abortSignal?: AbortSignal;
}): Promise<ParsedSttMultipart> {
  const maxFileBytes = args.maxFileBytes;
  const maxBodyBytes = maxFileBytes + STT_MULTIPART_OVERHEAD_SLACK_BYTES;
  let contentLengthChecked = false;

  const clRaw = args.contentLengthHeader?.trim();
  if (clRaw) {
    const cl = Number(clRaw);
    if (!Number.isFinite(cl) || cl < 0 || !Number.isInteger(cl)) {
      await cancelBody(args.body);
      throw ApiError.badRequest(
        "Invalid Content-Length header.",
        "invalid_request_error"
      );
    }
    contentLengthChecked = true;
    if (cl > maxBodyBytes) {
      // Reject before buffering the body.
      await cancelBody(args.body);
      throw ApiError.payloadTooLarge(
        `stt_upload_content_length_exceeded cl=${cl} max=${maxBodyBytes}`,
        "Audio upload exceeds the maximum allowed size."
      );
    }
  }

  if (!args.body) {
    throw ApiError.badRequest(
      "Audio transcription requires a multipart body.",
      "invalid_request_error"
    );
  }

  const reader = args.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (args.abortSignal?.aborted) {
        throw new ApiError({
          status: 499,
          message: "stt_client_aborted",
          code: "client_aborted",
          type: "invalid_request_error",
          publicMessage: "Client closed the request.",
        });
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        throw ApiError.payloadTooLarge(
          `stt_upload_body_exceeded bytes=${total} max=${maxBodyBytes}`,
          "Audio upload exceeds the maximum allowed size."
        );
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (args.abortSignal?.aborted) {
      throw new ApiError({
        status: 499,
        message: "stt_client_aborted",
        code: "client_aborted",
        type: "invalid_request_error",
        publicMessage: "Client closed the request.",
      });
    }
    throw ApiError.badRequest(
      "Invalid multipart audio transcription request.",
      "invalid_request_error"
    );
  }

  const raw = Buffer.concat(chunks);
  chunks.length = 0;
  let form: FormData;
  try {
    const synthetic = new Request("http://tokfai.local/v1/audio/transcriptions", {
      method: "POST",
      headers: { "content-type": args.contentType },
      body: raw,
    });
    form = await synthetic.formData();
  } catch {
    throw ApiError.badRequest(
      "Invalid multipart audio transcription request.",
      "invalid_request_error"
    );
  }

  let model = "";
  const modelField = form.get("model");
  if (typeof modelField === "string" && modelField.trim()) {
    model = modelField.trim();
  }

  let language: string | undefined;
  const langField = form.get("language");
  if (typeof langField === "string" && langField.trim()) {
    language = langField.trim();
  }

  let prompt: string | undefined;
  const promptField = form.get("prompt");
  if (typeof promptField === "string" && promptField.trim()) {
    prompt = promptField.trim().slice(0, 4000);
  }

  let responseFormat: string | undefined;
  const rfField = form.get("response_format");
  if (typeof rfField === "string" && rfField.trim()) {
    responseFormat = rfField.trim().slice(0, 64);
  }

  let temperature: number | undefined;
  const tempField = form.get("temperature");
  if (typeof tempField === "string" && tempField.trim()) {
    const n = Number(tempField);
    if (Number.isFinite(n)) temperature = n;
  }

  let filename = "audio.wav";
  let mimeType = "application/octet-stream";
  let bytes: Uint8Array | null = null;
  const fileField = form.get("file");
  if (fileField instanceof File) {
    filename = basenameOnly(fileField.name || "audio.wav");
    mimeType = fileField.type || mimeType;
    const ab = await fileField.arrayBuffer();
    bytes = new Uint8Array(ab);
  } else if (typeof fileField === "string" && fileField.length > 0) {
    bytes = new Uint8Array(Buffer.from(fileField));
  }

  if (!bytes || bytes.byteLength === 0) {
    throw ApiError.badRequest(
      "Audio file is required in multipart field `file`.",
      "invalid_request_error"
    );
  }

  if (bytes.byteLength > maxFileBytes) {
    throw ApiError.payloadTooLarge(
      `stt_upload_file_exceeded bytes=${bytes.byteLength} max=${maxFileBytes}`,
      "Audio upload exceeds the maximum allowed size."
    );
  }

  return {
    model,
    language,
    prompt,
    responseFormat,
    temperature,
    filename,
    mimeType,
    bytes,
    rawBodyBytes: total,
    contentLengthChecked,
  };
}
