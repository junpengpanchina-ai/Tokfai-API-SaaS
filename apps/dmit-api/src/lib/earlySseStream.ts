/**
 * Early-flush SSE for stream=true chat / responses.
 *
 * After auth, rate-limit, balance precheck, and schema normalize succeed, the
 * first SSE frame must be written immediately — before waiting on upstream.
 * Heartbeat comment frames (`: ping`) are sent when idle for 10s.
 */

export const EARLY_SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const DEFAULT_HEARTBEAT_MS = 10_000;

export type EarlySseWrite = (chunk: string) => void;

/**
 * Build a chunked SSE Response that flushes `firstFrame` before `produceRest`.
 * Does not set Content-Length (required for incremental flush).
 */
export function createEarlySseResponse(args: {
  requestId: string;
  firstFrame: string;
  produceRest: (write: EarlySseWrite) => Promise<void>;
  heartbeatMs?: number;
}): Response {
  const encoder = new TextEncoder();
  const heartbeatMs = args.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastActivityAt = Date.now();

      const write: EarlySseWrite = (chunk) => {
        if (closed || !chunk) return;
        controller.enqueue(encoder.encode(chunk));
        lastActivityAt = Date.now();
      };

      const heartbeat = setInterval(() => {
        if (closed) return;
        if (Date.now() - lastActivityAt >= heartbeatMs) {
          write(": ping\n\n");
        }
      }, Math.min(1_000, heartbeatMs));

      try {
        // Flush headers + first frame before any upstream await in produceRest.
        write(args.firstFrame);
        await args.produceRest(write);
      } catch {
        // Best-effort: never throw out of the stream start callback.
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed / cancelled
        }
      }
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
