/**
 * Normalize browser / Hermes STT uploads (webm / opus) to 16 kHz mono WAV
 * before forwarding to the OpenAI-compatible STT upstream.
 *
 * Isolated from chat / billing / model routing. Requires system `ffmpeg`.
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { ApiError } from "../../errors.js";
import { log } from "../../logger.js";

const execFileAsync = promisify(execFile);

const DEBUG_INPUT_PATH = "/tmp/tokfai-last-stt-input.webm";
const DEBUG_NORMALIZED_PATH = "/tmp/tokfai-last-stt-normalized.wav";

/** PCM s16le mono @ 16 kHz WAV header is 44 bytes. */
const WAV_HEADER_BYTES = 44;
const TARGET_SAMPLE_RATE = 16_000;
const TARGET_CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;

export type NormalizeSttAudioInput = {
  requestId: string;
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  /** Abort when the client disconnects. */
  abortSignal?: AbortSignal;
  /** ffmpeg wall-clock timeout (ms). */
  timeoutMs?: number;
};

export type NormalizeSttAudioResult = {
  /** Bytes to send upstream (original or normalized WAV). */
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  /** True when ffmpeg rewrote the payload. */
  normalized: boolean;
  originalMime: string;
  originalBytes: number;
  normalizedBytes: number;
  /** Duration seconds of the audio forwarded upstream (WAV estimate when normalized). */
  duration: number;
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function basenameOnly(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").trim() || "audio";
  return base.slice(0, 128);
}

/**
 * Hermes browser mic typically uploads video/webm, audio/webm, or opus.
 * Already-WAV / mp3 / m4a pass through unchanged.
 */
export function needsSttAudioNormalize(
  mimeType: string,
  filename: string
): boolean {
  const mime = String(mimeType || "")
    .trim()
    .toLowerCase();
  const ext = extOf(filename);
  if (mime.includes("webm") || mime.includes("opus")) return true;
  if (ext === ".webm" || ext === ".opus") return true;
  return false;
}

function audioDebugSaveEnabled(): boolean {
  const raw = String(process.env.TOKFAI_AUDIO_DEBUG_SAVE || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function durationSecondsFromPcmWav(wav: Uint8Array): number {
  if (wav.byteLength <= WAV_HEADER_BYTES) return 0;
  const pcmBytes = wav.byteLength - WAV_HEADER_BYTES;
  const denom = TARGET_SAMPLE_RATE * TARGET_CHANNELS * BYTES_PER_SAMPLE;
  return Math.round((pcmBytes / denom) * 1000) / 1000;
}

async function writeDebugCopies(
  requestId: string,
  original: Uint8Array,
  normalized: Uint8Array
): Promise<void> {
  if (!audioDebugSaveEnabled()) return;
  try {
    await fs.writeFile(DEBUG_INPUT_PATH, original);
    await fs.writeFile(DEBUG_NORMALIZED_PATH, normalized);
    log.info("audio_transcription_debug_saved", {
      request_id: requestId,
      original_bytes: original.byteLength,
      normalized_bytes: normalized.byteLength,
    });
  } catch (err) {
    log.warn("audio_transcription_debug_save_failed", {
      request_id: requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Convert webm/opus (etc.) → 16 kHz mono PCM WAV via ffmpeg.
 * Non-matching formats are returned unchanged (duration 0 unknown).
 */
export async function normalizeSttAudioForUpstream(
  input: NormalizeSttAudioInput
): Promise<NormalizeSttAudioResult> {
  const originalMime = input.mimeType || "application/octet-stream";
  const originalBytes = input.bytes.byteLength;
  const filename = basenameOnly(input.filename);

  if (!needsSttAudioNormalize(originalMime, filename)) {
    return {
      bytes: input.bytes,
      mimeType: originalMime,
      filename,
      normalized: false,
      originalMime,
      originalBytes,
      normalizedBytes: originalBytes,
      duration: 0,
    };
  }

  if (input.abortSignal?.aborted) {
    throw new ApiError({
      status: 499,
      message: "client_aborted",
      code: "client_aborted",
      type: "invalid_request_error",
      publicMessage: "Client aborted the request.",
    });
  }

  const id = randomBytes(8).toString("hex");
  const workDir = join(tmpdir(), `tokfai-stt-${id}`);
  const inExt = extOf(filename) || ".webm";
  const inPath = join(workDir, `input${inExt}`);
  const outPath = join(workDir, "normalized.wav");
  const timeoutMs =
    typeof input.timeoutMs === "number" && input.timeoutMs > 0
      ? input.timeoutMs
      : 30_000;

  await fs.mkdir(workDir, { recursive: true });
  try {
    await fs.writeFile(inPath, input.bytes);

    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          inPath,
          "-vn",
          "-ac",
          String(TARGET_CHANNELS),
          "-ar",
          String(TARGET_SAMPLE_RATE),
          "-c:a",
          "pcm_s16le",
          "-f",
          "wav",
          outPath,
        ],
        {
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
          signal: input.abortSignal,
        }
      );
    } catch (err) {
      const aborted =
        input.abortSignal?.aborted ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted) {
        throw new ApiError({
          status: 499,
          message: "client_aborted",
          code: "client_aborted",
          type: "invalid_request_error",
          publicMessage: "Client aborted the request.",
        });
      }
      log.warn("audio_transcription_ffmpeg_failed", {
        request_id: input.requestId,
        original_mime: originalMime,
        original_bytes: originalBytes,
        message: err instanceof Error ? err.message : String(err),
      });
      throw new ApiError({
        status: 400,
        message: "stt_audio_normalize_failed",
        code: "invalid_request_error",
        type: "invalid_request_error",
        publicMessage:
          "Unable to decode uploaded audio. Send a valid webm/opus/wav file.",
      });
    }

    const wav = new Uint8Array(await fs.readFile(outPath));
    if (wav.byteLength <= WAV_HEADER_BYTES) {
      throw new ApiError({
        status: 400,
        message: "stt_audio_normalize_empty",
        code: "invalid_request_error",
        type: "invalid_request_error",
        publicMessage: "Decoded audio is empty.",
      });
    }

    const duration = durationSecondsFromPcmWav(wav);
    const outName = filename.replace(/\.[^.]+$/, "") || "audio";
    const normalizedFilename = `${outName}.wav`;

    await writeDebugCopies(input.requestId, input.bytes, wav);

    log.info("audio_transcription_normalized", {
      request_id: input.requestId,
      original_mime: originalMime,
      original_bytes: originalBytes,
      normalized_bytes: wav.byteLength,
      duration,
      normalized: true,
    });

    return {
      bytes: wav,
      mimeType: "audio/wav",
      filename: normalizedFilename,
      normalized: true,
      originalMime,
      originalBytes,
      normalizedBytes: wav.byteLength,
      duration,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
