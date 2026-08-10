/**
 * P1079 — mock OpenAI-compatible self-hosted STT worker.
 * Used only by offline harnesses. Never talks to a real Whisper runtime.
 */

import { createServer } from "node:http";

/**
 * @typedef {object} MockWorkerHit
 * @property {string} path
 * @property {string} method
 * @property {string} auth
 * @property {string|null} model
 * @property {string|null} language
 * @property {string|null} prompt
 * @property {string|null} response_format
 * @property {string|null} temperature
 * @property {number} bodyBytes
 * @property {boolean} hasFilePart
 * @property {boolean} bodyLooksBase64Json
 * @property {string} contentType
 * @property {Buffer} rawBody
 */

/**
 * @param {object} opts
 * @param {(ctx: { req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, hit: MockWorkerHit, raw: Buffer }) => void | Promise<void>} [opts.handler]
 * @param {number} [opts.delayMs]
 */
export async function withMockSttWorker(opts, fn) {
  /** @type {MockWorkerHit[]} */
  const hits = [];
  const handler =
    typeof opts === "function"
      ? opts
      : opts?.handler ??
        (({ res }) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ text: "P1079_MOCK_TRANSCRIPT_OK" }));
        });
  const delayMs = typeof opts === "object" && opts ? opts.delayMs ?? 0 : 0;

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const raw = Buffer.concat(chunks);
      const rawUtf8 = raw.toString("utf8");
      const contentType = String(req.headers["content-type"] || "");
      const modelMatch = /name="model"\r\n\r\n([^\r\n]*)/.exec(rawUtf8);
      const languageMatch = /name="language"\r\n\r\n([^\r\n]*)/.exec(rawUtf8);
      const promptMatch = /name="prompt"\r\n\r\n([^\r\n]*)/.exec(rawUtf8);
      const rfMatch = /name="response_format"\r\n\r\n([^\r\n]*)/.exec(rawUtf8);
      const tempMatch = /name="temperature"\r\n\r\n([^\r\n]*)/.exec(rawUtf8);
      const hasFilePart =
        /name="file"/.test(rawUtf8) ||
        /filename=/.test(rawUtf8);
      const bodyLooksBase64Json =
        contentType.includes("application/json") &&
        /"file"\s*:/.test(rawUtf8) &&
        /base64/i.test(rawUtf8);

      /** @type {MockWorkerHit} */
      const hit = {
        path: req.url || "",
        method: req.method || "GET",
        auth: String(req.headers.authorization || ""),
        model: modelMatch?.[1] ?? null,
        language: languageMatch?.[1] ?? null,
        prompt: promptMatch?.[1] ?? null,
        response_format: rfMatch?.[1] ?? null,
        temperature: tempMatch?.[1] ?? null,
        bodyBytes: raw.byteLength,
        hasFilePart,
        bodyLooksBase64Json,
        contentType,
        rawBody: raw,
      };
      hits.push(hit);

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      await handler({ req, res, hit, raw });
    });
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = /** @type {{ port: number }} */ (server.address());
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await fn({ baseUrl, hits, port });
  } finally {
    server.close();
  }
}

/** Preset handlers for common worker failure modes. */
export const mockWorkerPresets = {
  ok: ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "P1079_MOCK_TRANSCRIPT_OK" }));
  },
  emptyTranscript: ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "" }));
  },
  malformedJson: ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{not-json");
  },
  unauthorized: ({ res }) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "unauthorized" } }));
  },
  forbidden: ({ res }) => {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "forbidden" } }));
  },
  overloaded: ({ res }) => {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "overloaded" } }));
  },
  serverError: ({ res }) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "boom" } }));
  },
  modelUnavailable: ({ res }) => {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "model_not_found" } }));
  },
  requireAuth: (expectedKey) => ({ res, hit }) => {
    if (hit.auth !== `Bearer ${expectedKey}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "unauthorized" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "P1079_AUTH_OK" }));
  },
};
