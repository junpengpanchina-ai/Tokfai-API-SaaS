/**
 * Isolated STT provider types (P1072).
 * Never shared with executeChatCompletion.
 */

export type AudioSttProviderId =
  | "openai_compatible"
  | "groq_whisper_compatible"
  | "unavailable";

export type TranscribeAudioInput = {
  requestId: string;
  model: string;
  /** Raw audio bytes — never log. */
  bytes: Uint8Array;
  mimeType: string;
  /** Basename only for upstream multipart; never log full paths. */
  filename: string;
  language?: string;
  timeoutMs: number;
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
  timeoutMs: number;
  /** Flat credits per successful transcription; null = not priced → not_billable. */
  priceCredits: number | null;
};
