/**
 * Early-flush SSE for stream=true chat / responses.
 *
 * After auth, rate-limit, balance precheck, and schema normalize succeed, the
 * first SSE frame must be written immediately — before waiting on upstream.
 * Heartbeat comment frames (`: ping`) are sent when idle for 10s.
 *
 * Final client bytes leave via controller.enqueue — chat.completion.chunk
 * frames are sanitized here so finish_reason never reaches the client as
 * other|unknown|null (Cherry Studio AI_FinishReasonError).
 *
 * P1062 — request-scoped terminal state machine:
 * closed / cancelled / errored stop heartbeat exactly once, make close/cancel
 * idempotent, and never let write-after-close throw ERR_INVALID_STATE onto
 * the main request chain (while still logging the skip / enqueue failure).
 */

import {
  chatCompletionEmergencyStopSseFrame,
  sanitizeChatCompletionSseOutboundText,
  sseTextHasOpenAiWireFinish,
} from "./chatCompletionSse.js";
import { log } from "../logger.js";

export const EARLY_SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  // close — not keep-alive. Nginx/edge keep-alive after SSE can yield
  // empty-body HTTP 400 (no Content-Type / no x-request-id) on the next
  // request of the same socket; that breaks Cherry Studio sequential chats
  // and P932/P933. Buffered noop SSE already uses Connection: close.
  Connection: "close",
  "X-Accel-Buffering": "no",
} as const;

const DEFAULT_HEARTBEAT_MS = 10_000;

export type EarlySseWrite = (chunk: string) => void;

type EarlySseTerminal = "open" | "closed" | "cancelled" | "errored";

function looksLikeChatCompletionSse(firstFrame: string): boolean {
  return (
    firstFrame.includes('"choices"') &&
    (firstFrame.includes('"delta"') || firstFrame.includes("chat.completion"))
  );
}

function errorNameOf(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  return typeof err;
}

function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

/**
 * Build a chunked SSE Response that flushes `firstFrame` before `produceRest`.
 * Does not set Content-Length (required for incremental flush).
 */
export function createEarlySseResponse(args: {
  requestId: string;
  firstFrame: string;
  produceRest: (write: EarlySseWrite) => Promise<void>;
  heartbeatMs?: number;
  /**
   * P1080 — invoked exactly once when the client cancels the ReadableStream
   * (disconnect). Used to abort the in-flight upstream fetch / queue wait.
   */
  onClientCancel?: () => void;
}): Response {
  const encoder = new TextEncoder();
  const heartbeatMs = args.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const chatSse = looksLikeChatCompletionSse(args.firstFrame);

  let terminal: EarlySseTerminal = "open";
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let heartbeatCleared = false;
  let clientCancelNotified = false;

  const clearHeartbeatExactlyOnce = () => {
    if (heartbeatCleared) return;
    heartbeatCleared = true;
    if (heartbeat != null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const notifyClientCancelExactlyOnce = () => {
    if (clientCancelNotified) return;
    clientCancelNotified = true;
    try {
      args.onClientCancel?.();
    } catch {
      // never throw out of cancel path
    }
  };

  const markTerminal = (reason: Exclude<EarlySseTerminal, "open">) => {
    if (terminal !== "open") return;
    terminal = reason;
    clearHeartbeatExactlyOnce();
    log.info("early_sse_terminal", {
      requestId: args.requestId,
      reason,
      billing_status: "not_billable",
      credits_charged: 0,
    });
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastActivityAt = Date.now();
      let sawWireFinish = false;
      let sawDone = false;

      const safeEnqueue = (
        bytes: Uint8Array,
        source: "data" | "heartbeat"
      ): boolean => {
        if (terminal !== "open") {
          if (source === "heartbeat") {
            log.info("early_sse_heartbeat_skipped_terminal", {
              requestId: args.requestId,
              reason: terminal,
              billing_status: "not_billable",
              credits_charged: 0,
            });
          }
          return false;
        }
        try {
          controller.enqueue(bytes);
          lastActivityAt = Date.now();
          return true;
        } catch (err) {
          // Client cancel / double-close can make enqueue throw ERR_INVALID_STATE.
          // Mark terminal + log; never rethrow into the timer or produceRest chain.
          markTerminal("errored");
          log.warn("early_sse_enqueue_failed", {
            requestId: args.requestId,
            reason: "errored",
            errorName: errorNameOf(err),
            code: errorCodeOf(err) ?? "ERR_INVALID_STATE",
            message:
              source === "heartbeat"
                ? "heartbeat_enqueue_failed"
                : "data_enqueue_failed",
            billing_status: "not_billable",
            credits_charged: 0,
          });
          return false;
        }
      };

      const write: EarlySseWrite = (chunk) => {
        if (terminal !== "open" || !chunk) return;
        // Ultimate SSE exit for /v1/chat/completions stream=true.
        const outbound = chatSse
          ? sanitizeChatCompletionSseOutboundText(chunk)
          : chunk;
        if (chatSse) {
          if (sseTextHasOpenAiWireFinish(outbound)) sawWireFinish = true;
          if (/data:\s*\[DONE\]/i.test(outbound)) sawDone = true;
        }
        safeEnqueue(encoder.encode(outbound), "data");
      };

      heartbeat = setInterval(() => {
        if (terminal !== "open") {
          log.info("early_sse_heartbeat_skipped_terminal", {
            requestId: args.requestId,
            reason: terminal,
            billing_status: "not_billable",
            credits_charged: 0,
          });
          clearHeartbeatExactlyOnce();
          return;
        }
        if (Date.now() - lastActivityAt >= heartbeatMs) {
          safeEnqueue(encoder.encode(": ping\n\n"), "heartbeat");
        }
      }, Math.min(1_000, heartbeatMs));

      try {
        // Flush headers + first frame before any upstream await in produceRest.
        write(args.firstFrame);
        await args.produceRest(write);
      } catch {
        // Best-effort: never throw out of the stream start callback.
        // Provider / execute failures must surface via writeFailure / result.ok.
      } finally {
        clearHeartbeatExactlyOnce();
        try {
          // AI SDK defaults finishReason to "other" when the stream closes
          // without a string finish_reason — always emit one for chat SSE.
          if (terminal === "open" && chatSse && !sawWireFinish) {
            write(chatCompletionEmergencyStopSseFrame());
          }
          if (terminal === "open" && chatSse && !sawDone) {
            write("data: [DONE]\n\n");
          }
        } catch {
          // ignore ensure-finish failures
        }
        if (terminal === "open") {
          markTerminal("closed");
        }
        try {
          controller.close();
        } catch {
          // already closed / cancelled — idempotent
        }
      }
    },
    cancel() {
      // Client disconnect: stop heartbeat before any further enqueue.
      markTerminal("cancelled");
      // P1080 — abort upstream fetch / heavy queue wait.
      notifyClientCancelExactlyOnce();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...EARLY_SSE_HEADERS,
      "X-Request-Id": args.requestId,
    },
  });
}

/**
 * Coordinate early SSE with executeChatCompletion's onAfterPrecheck:
 * - precheck failures → caller returns JSON error envelope (no SSE)
 * - precheck success → open SSE and flush first frame without awaiting upstream
 */
export async function runWithEarlySseGate<T>(args: {
  requestId: string;
  firstFrame: string;
  execute: (hooks: {
    onAfterPrecheck: () => void | Promise<void>;
  }) => Promise<T>;
  isFailure: (result: T) => boolean;
  writeRest: (write: EarlySseWrite, result: T) => void;
  writeFailure?: (write: EarlySseWrite, result: T) => void;
  /** P1080 — forwarded to createEarlySseResponse.cancel → abort upstream. */
  onClientCancel?: () => void;
}): Promise<Response | { earlyDone: T }> {
  let signalReady!: () => void;
  const readySignal = new Promise<void>((resolve) => {
    signalReady = resolve;
  });

  const resultPromise = args.execute({
    onAfterPrecheck: () => {
      signalReady();
    },
  });

  const outcome = await Promise.race([
    readySignal.then(() => ({ kind: "ready" as const })),
    resultPromise.then((result) => ({ kind: "done" as const, result })),
  ]);

  if (outcome.kind === "done") {
    // Finished during precheck (failure) or without upstream (idempotent replay).
    return { earlyDone: outcome.result };
  }

  return createEarlySseResponse({
    requestId: args.requestId,
    firstFrame: args.firstFrame,
    onClientCancel: args.onClientCancel,
    produceRest: async (write) => {
      const result = await resultPromise;
      if (args.isFailure(result)) {
        args.writeFailure?.(write, result);
        return;
      }
      args.writeRest(write, result);
    },
  });
}
