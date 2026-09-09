#!/usr/bin/env node
/**
 * Tokfai Audio P6 — lightweight OpenAI-compatible TTS worker.
 * Uses espeak-ng (+ ffmpeg for mp3). Bind 127.0.0.1 only.
 *
 * Gateway:
 *   TOKFAI_TTS_PROVIDER=openai_compatible
 *   TOKFAI_TTS_BASE_URL=http://127.0.0.1:8792/v1
 *   TOKFAI_TTS_API_KEY=<dedicated TTS key, never GRSAI_API_KEY>
 *
 * Env:
 *   TOKFAI_TTS_WORKER_PORT / TOKFAI_TTS_WORKER_HOST (default 8792 / 127.0.0.1)
 *   TOKFAI_TTS_API_KEY / TOKFAI_TTS_WORKER_API_KEY
 *   TOKFAI_TTS_ESPEAK_BIN (default: espeak-ng)
 *   TOKFAI_TTS_FFMPEG_BIN (default: ffmpeg)
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = String(process.env.TOKFAI_TTS_WORKER_HOST || "127.0.0.1").trim();
const PORT = Number(process.env.TOKFAI_TTS_WORKER_PORT || 8792) || 8792;
const API_KEY = String(
  process.env.TOKFAI_TTS_WORKER_API_KEY ||
    process.env.TOKFAI_TTS_API_KEY ||
    ""
).trim();
const ESPEAK_BIN = String(
  process.env.TOKFAI_TTS_ESPEAK_BIN || "espeak-ng"
).trim();
const FFMPEG_BIN = String(process.env.TOKFAI_TTS_FFMPEG_BIN || "ffmpeg").trim();
const MAX_INPUT_CHARS = 4096;

/** Map OpenAI voice names → espeak-ng voice ids (best-effort). */
const VOICE_MAP = {
  alloy: "en-us+f3",
  echo: "en-us+m3",
  fable: "en-gb+f2",
  onyx: "en-us+m2",
  nova: "en-us+f4",
  shimmer: "en-us+f5",
};

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
      message: "Invalid TTS worker API key.",
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

function readJsonBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("body_too_large"), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("invalid_json"), { code: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else
        reject(
          new Error(
            `${cmd} exited ${code}: ${stderr.trim() || "no stderr"}`.slice(0, 500)
          )
        );
    });
  });
}

function resolveVoice(voice) {
  const key = String(voice || "alloy")
    .trim()
    .toLowerCase();
  return VOICE_MAP[key] || VOICE_MAP.alloy;
}

function contentTypeForFormat(fmt) {
  const f = String(fmt || "mp3")
    .trim()
    .toLowerCase();
  if (f === "wav") return "audio/wav";
  return "audio/mpeg";
}

/**
 * @param {string} text
 * @param {string} voice
 * @param {string} responseFormat
 */
async function synthesize(text, voice, responseFormat) {
  const work = mkdtempSync(join(tmpdir(), "tokfai-tts-"));
  const wavPath = join(work, "out.wav");
  const mp3Path = join(work, "out.mp3");
  const txtPath = join(work, "in.txt");
  try {
    writeFileSync(txtPath, text, "utf8");
    await run(ESPEAK_BIN, [
      "-v",
      resolveVoice(voice),
      "-f",
      txtPath,
      "-w",
      wavPath,
    ]);
    const fmt = String(responseFormat || "mp3")
      .trim()
      .toLowerCase();
    if (fmt === "wav") {
      const buf = readFileSync(wavPath);
      return { buf, contentType: "audio/wav" };
    }
    await run(FFMPEG_BIN, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      wavPath,
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "4",
      mp3Path,
    ]);
    const buf = readFileSync(mp3Path);
    return { buf, contentType: contentTypeForFormat(fmt) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
    json(res, 200, { ok: true, service: "tokfai-tts-worker" });
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/v1/audio/speech") {
    json(res, 404, {
      error: {
        message: "Not found",
        code: "route_not_found",
        type: "not_found",
      },
    });
    return;
  }
  if (!checkAuth(req)) {
    unauthorized(res);
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const code = err && err.code === 413 ? 413 : 400;
    json(res, code, {
      error: {
        message: code === 413 ? "Request body too large." : "Invalid JSON body.",
        code: code === 413 ? "request_body_too_large" : "invalid_request_error",
        type: "invalid_request_error",
      },
    });
    return;
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    json(res, 400, {
      error: {
        message: "Field `input` is required.",
        code: "invalid_request_error",
        type: "invalid_request_error",
      },
    });
    return;
  }
  if (input.length > MAX_INPUT_CHARS) {
    json(res, 400, {
      error: {
        message: `input exceeds ${MAX_INPUT_CHARS} characters.`,
        code: "invalid_request_error",
        type: "invalid_request_error",
      },
    });
    return;
  }

  const voice = typeof body.voice === "string" ? body.voice : "alloy";
  const responseFormat =
    typeof body.response_format === "string" ? body.response_format : "mp3";

  try {
    const { buf, contentType } = await synthesize(input, voice, responseFormat);
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": buf.length,
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        msg: "tts_worker_synthesize_failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    json(res, 502, {
      error: {
        message: "TTS synthesis failed.",
        code: "upstream_error",
        type: "upstream_error",
      },
    });
  }
});

if (!API_KEY) {
  console.error("TOKFAI_TTS_API_KEY / TOKFAI_TTS_WORKER_API_KEY required");
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      msg: "tokfai_tts_worker_listen",
      host: HOST,
      port: PORT,
      espeak: ESPEAK_BIN,
    })
  );
});
