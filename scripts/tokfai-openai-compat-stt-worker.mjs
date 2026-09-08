#!/usr/bin/env node
/**
 * Tokfai Audio P2 — lightweight OpenAI-compatible STT worker backed by
 * whisper.cpp CLI (on-demand subprocess). Fits ~1Gi HKG boxes.
 *
 * Bind 127.0.0.1 only. Configure gateway:
 *   TOKFAI_STT_PROVIDER=openai_compatible
 *   TOKFAI_STT_BASE_URL=http://127.0.0.1:8791/v1
 *   TOKFAI_STT_API_KEY=<dedicated STT key, never GRSAI_API_KEY>
 *
 * Env:
 *   TOKFAI_STT_WORKER_PORT / TOKFAI_STT_WORKER_HOST
 *   TOKFAI_STT_API_KEY / TOKFAI_STT_WORKER_API_KEY
 *   TOKFAI_STT_WHISPER_BIN  (default: workers/openai-compat-stt/bin/whisper-cli)
 *   TOKFAI_STT_WHISPER_MODEL (default: .../models/ggml-tiny.en.bin)
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORKER_DIR = join(ROOT, "workers/openai-compat-stt");

const HOST = String(process.env.TOKFAI_STT_WORKER_HOST || "127.0.0.1").trim();
const PORT = Number(process.env.TOKFAI_STT_WORKER_PORT || 8791) || 8791;
const API_KEY = String(
  process.env.TOKFAI_STT_WORKER_API_KEY ||
    process.env.TOKFAI_STT_API_KEY ||
    ""
).trim();
const WHISPER_BIN = String(
  process.env.TOKFAI_STT_WHISPER_BIN ||
    join(WORKER_DIR, "bin/whisper-cli")
).trim();
const WHISPER_MODEL = String(
  process.env.TOKFAI_STT_WHISPER_MODEL ||
    join(WORKER_DIR, "models/ggml-tiny.en.bin")
).trim();

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function unauthorized(res) {
  json(res, 401, {
    error: {
      message: "Invalid STT worker API key.",
      code: "invalid_api_key",
      type: "auth_error",
    },
  });
}

function checkAuth(req) {
  if (!API_KEY) return false;
  const h = String(req.headers.authorization || "");
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m && m[1].trim() === API_KEY);
}

/**
 * @param {Buffer} raw
 * @param {string} contentType
 */
function extractMultipartFile(raw, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  const boundary = (m?.[1] || m?.[2] || "").trim();
  if (!boundary) throw new Error("multipart_boundary_missing");
  const sep = Buffer.from(`--${boundary}`);
  let start = raw.indexOf(sep);
  while (start >= 0) {
    const next = raw.indexOf(sep, start + sep.length);
    const chunk = raw.subarray(
      start + sep.length,
      next >= 0 ? next : raw.length
    );
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const header = chunk.subarray(0, headerEnd).toString("utf8");
      if (/name="file"/i.test(header) || /filename=/i.test(header)) {
        let body = chunk.subarray(headerEnd + 4);
        if (body.length >= 2 && body[body.length - 1] === 0x0a) {
          body = body.subarray(0, body.length - 1);
          if (body.length >= 1 && body[body.length - 1] === 0x0d) {
            body = body.subarray(0, body.length - 1);
          }
        }
        return body;
      }
    }
    start = next;
  }
  throw new Error("multipart_file_missing");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const max = 30 * 1024 * 1024;
    req.on("data", (c) => {
      total += c.length;
      if (total > max) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function runWhisper(wavPath) {
  return new Promise((resolve, reject) => {
    if (!existsSync(WHISPER_BIN)) {
      reject(new Error(`whisper_bin_missing:${WHISPER_BIN}`));
      return;
    }
    if (!existsSync(WHISPER_MODEL)) {
      reject(new Error(`whisper_model_missing:${WHISPER_MODEL}`));
      return;
    }
    const args = [
      "-m",
      WHISPER_MODEL,
      "-f",
      wavPath,
      "-otxt",
      "-of",
      wavPath.replace(/\.wav$/i, ""),
      "-np",
      "-nt",
    ];
    const child = spawn(WHISPER_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [
          dirname(WHISPER_BIN),
          process.env.LD_LIBRARY_PATH || "",
        ]
          .filter(Boolean)
          .join(":"),
      },
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("whisper_timeout"));
    }, 90_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const txtPath = wavPath.replace(/\.wav$/i, "") + ".txt";
      try {
        if (existsSync(txtPath)) {
          const text = readFileSync(txtPath, "utf8").trim();
          resolve(text);
          return;
        }
      } catch {
        // fall through
      }
      if (code !== 0) {
        reject(new Error(`whisper_exit_${code}:${stderr.slice(0, 200)}`));
        return;
      }
      resolve("");
    });
  });
}

async function handleTranscription(req, res, raw) {
  if (!checkAuth(req)) return unauthorized(res);
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json(res, 400, {
      error: {
        message: "multipart/form-data required",
        code: "invalid_request_error",
        type: "invalid_request_error",
      },
    });
  }

  let fileBuf;
  try {
    fileBuf = extractMultipartFile(raw, contentType);
  } catch (err) {
    return json(res, 400, {
      error: {
        message: err instanceof Error ? err.message : "invalid_multipart",
        code: "invalid_request_error",
        type: "invalid_request_error",
      },
    });
  }

  const dir = mkdtempSync(join(tmpdir(), "tokfai-stt-"));
  const wavPath = join(dir, "audio.wav");
  try {
    writeFileSync(wavPath, fileBuf);
    const text = await runWhisper(wavPath);
    return json(res, 200, { text: String(text || "") });
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "stt_worker_transcribe_failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return json(res, 502, {
      error: {
        message: "STT worker transcription failed.",
        code: "upstream_error",
        type: "upstream_error",
      },
    });
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

if (!API_KEY) {
  console.error(
    JSON.stringify({
      msg: "stt_worker_missing_api_key",
      hint: "Set TOKFAI_STT_API_KEY or TOKFAI_STT_WORKER_API_KEY",
    })
  );
  process.exit(1);
}

mkdirSync(join(WORKER_DIR, "bin"), { recursive: true });
mkdirSync(join(WORKER_DIR, "models"), { recursive: true });

const server = createServer(async (req, res) => {
  const url = String(req.url || "").split("?")[0];
  if (req.method === "GET" && (url === "/health" || url === "/v1/health")) {
    return json(res, 200, {
      ok: true,
      service: "tokfai-stt-worker",
      engine: "whisper.cpp",
      bin: existsSync(WHISPER_BIN),
      model: existsSync(WHISPER_MODEL),
      ready: existsSync(WHISPER_BIN) && existsSync(WHISPER_MODEL),
    });
  }
  if (req.method === "POST" && url === "/v1/audio/transcriptions") {
    try {
      const raw = await readBody(req);
      return await handleTranscription(req, res, raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "body_too_large") {
        return json(res, 413, {
          error: {
            message: "Request body too large.",
            code: "request_body_too_large",
            type: "invalid_request_error",
          },
        });
      }
      return json(res, 500, {
        error: {
          message: "Internal STT worker error.",
          code: "server_error",
          type: "server_error",
        },
      });
    }
  }
  return json(res, 404, {
    error: {
      message: `No route for ${req.method} ${url}.`,
      code: "route_not_found",
      type: "not_found",
    },
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify({
      msg: "stt_worker_listen",
      host: HOST,
      port: PORT,
      bin: WHISPER_BIN,
      model: WHISPER_MODEL,
      ready: existsSync(WHISPER_BIN) && existsSync(WHISPER_MODEL),
    })
  );
});
