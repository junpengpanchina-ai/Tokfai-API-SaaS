/**
 * Isolated STT provider types (P1072).
 * Never shared with executeChatCompletion.
 */

export type AudioSttProviderId =
  | "openai_compatible"
  | "groq_whisper_compatible"
  | "grsai_whisper_compatible"
  | "self_hosted_whisper"
  | "unavailable";

export type TranscribeAudioInput = {
  requestId: string;
  model: string;
  /**
   * Raw audio bytes from gateway multipart parse — never log, never base64 JSON.
   * Self-hosted adapter forwards these via FormData (no second app-level copy).
   */
  bytes: Uint8Array;
  mimeType: string;
  /** Basename only for upstream multipart; never log full paths. */
  filename: string;
  language?: string;
  prompt?: string;
  responseFormat?: string;
  temperature?: number;
  timeoutMs: number;
  /** Consumer disconnect / gateway abort — must cancel worker fetch. */
  abortSignal?: AbortSignal;
  /**
   * Admin channel "test connection" only: silence WAV often yields empty text.
   * Consumer transcription must still reject empty transcripts.
   */
  allowEmptyTranscript?: boolean;
};

export type TranscribeAudioResult = {
  text: string;
  providerId: AudioSttProviderId;
  upstreamModel: string;
  upstreamStatus: number;
  latencyMs: number;
  durationSeconds?: number;
};

export type AudioSttProvider = {
  id: AudioSttProviderId;
  /** False when credentials / base URL missing — route must not fake text. */
  available: boolean;
  transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult>;
};

export type ResolvedAudioSttConfig = {
  providerId: AudioSttProviderId;
  baseUrl: string | null;
  apiKeySet: boolean;
  defaultModel: string;
  /**
   * When set (admin STT channel), this model is sent upstream.
   * Client model remains public contract / intent only.
   * Null on env fallback → use client || defaultModel (legacy).
   */
  upstreamModel: string | null;
  timeoutMs: number;
  /** Flat credits per successful transcription; null = not priced → not_billable. */
  priceCredits: number | null;
  source: "admin_channel" | "env" | "unavailable";
  channelId: string | null;
};
