import { execFile } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { Hono } from "hono";

import { env } from "../env.js";

const execFileAsync = promisify(execFile);

const PRIMARY_DATA_ROOT = "/opt/tokfai-data";
const FALLBACK_DATA_ROOT = path.join(process.cwd(), ".tokfai-data");
const AVIATION_REL = "aviation/jobs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 256 * 1024;
const MAX_PER_FILE_CHARS = 40_000;
const MAX_TOTAL_CHARS = 180_000;
const MIN_EXTRACT_CHARS_FOR_MODEL = 100;

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".log",
  ".json",
  ".csv",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".hh",
  ".py",
  ".m",
]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".log",
  ".json",
  ".csv",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".hh",
  ".py",
  ".m",
]);

type JobMeta = {
  jobId: string;
  status: string;
  dataRoot: string;
  createdAt: string;
  extractedFileCount?: number;
  totalExtractedChars?: number;
};

type FileExtractResult = {
  filename: string;
  status:
    | "OK"
    | "UNSUPPORTED"
    | "PDFTOTEXT_NOT_INSTALLED"
    | "READ_FAILED"
    | "EMPTY_TEXT";
  text: string;
};

export const adminAviationRoutes = new Hono();

async function resolveWritableDataRoot(): Promise<string> {
  try {
    await fs.mkdir(PRIMARY_DATA_ROOT, { recursive: true });
    await fs.access(PRIMARY_DATA_ROOT, fsConstants.W_OK);
    return PRIMARY_DATA_ROOT;
  } catch {
    await fs.mkdir(FALLBACK_DATA_ROOT, { recursive: true });
    return FALLBACK_DATA_ROOT;
  }
}

function isValidJobId(jobId: string): boolean {
  return /^av_[a-zA-Z0-9_]+$/.test(jobId);
}

function jobBaseDir(dataRoot: string, jobId: string): string {
  return path.join(dataRoot, AVIATION_REL, jobId);
}

function inboxDir(dataRoot: string, jobId: string): string {
  return path.join(jobBaseDir(dataRoot, jobId), "inbox");
}

function extractedDir(dataRoot: string, jobId: string): string {
  return path.join(jobBaseDir(dataRoot, jobId), "extracted");
}

function resultsDir(dataRoot: string, jobId: string): string {
  return path.join(jobBaseDir(dataRoot, jobId), "results");
}

function metaPath(dataRoot: string, jobId: string): string {
  return path.join(jobBaseDir(dataRoot, jobId), "job-meta.json");
}

function extractPath(dataRoot: string, jobId: string): string {
  return path.join(extractedDir(dataRoot, jobId), "customer-file-extract.md");
}

function diagnosisPath(dataRoot: string, jobId: string): string {
  return path.join(resultsDir(dataRoot, jobId), "diagnosis.md");
}

function rawResultPath(dataRoot: string, jobId: string): string {
  return path.join(resultsDir(dataRoot, jobId), "raw.json");
}

function sanitizeFilename(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() || "upload.bin";
  const ext = path.extname(base).toLowerCase();
  const stem = path.basename(base, path.extname(base));
  const safeStem = stem
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const safeExt = ext.replace(/[^a-zA-Z0-9.]+/g, "").slice(0, 16);
  const name = `${safeStem || "upload"}${safeExt}`;
  return name.slice(0, 200);
}

function extensionOf(filename: string): string {
  return path.extname(filename).toLowerCase();
}

async function readJobMeta(dataRoot: string, jobId: string): Promise<JobMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(dataRoot, jobId), "utf8");
    return JSON.parse(raw) as JobMeta;
  } catch {
    return null;
  }
}

async function writeJobMeta(dataRoot: string, meta: JobMeta): Promise<void> {
  await fs.writeFile(metaPath(dataRoot, meta.jobId), JSON.stringify(meta, null, 2));
}

async function findJobDataRoot(jobId: string): Promise<string | null> {
  for (const root of [PRIMARY_DATA_ROOT, FALLBACK_DATA_ROOT]) {
    const meta = await readJobMeta(root, jobId);
    if (meta) return root;
    try {
      await fs.access(jobBaseDir(root, jobId));
      return root;
    } catch {
      // continue
    }
  }
  return null;
}

async function listInboxFileNames(dataRoot: string, jobId: string): Promise<string[]> {
  const dir = inboxDir(dataRoot, jobId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function listInboxFilesDetailed(
  dataRoot: string,
  jobId: string
): Promise<Array<{ name: string; size: number }>> {
  const names = await listInboxFileNames(dataRoot, jobId);
  const files: Array<{ name: string; size: number }> = [];
  for (const name of names) {
    try {
      const stat = await fs.stat(path.join(inboxDir(dataRoot, jobId), name));
      files.push({ name, size: stat.size });
    } catch {
      files.push({ name, size: 0 });
    }
  }
  return files;
}

async function cancelBody(
  body: ReadableStream<Uint8Array> | null
): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // ignore
  }
}

async function readMultipartFileWithLimit(args: {
  contentType: string;
  contentLengthHeader: string | undefined;
  body: ReadableStream<Uint8Array> | null;
  maxFileBytes: number;
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const maxBodyBytes = args.maxFileBytes + MULTIPART_OVERHEAD_BYTES;

  const clRaw = args.contentLengthHeader?.trim();
  if (clRaw) {
    const cl = Number(clRaw);
    if (!Number.isFinite(cl) || cl < 0 || !Number.isInteger(cl)) {
      await cancelBody(args.body);
      throw new UploadError(400, "invalid_request_error", "Invalid Content-Length.");
    }
    if (cl > maxBodyBytes) {
      await cancelBody(args.body);
      throw new UploadError(413, "file_too_large", "File exceeds the maximum allowed size.");
    }
  }

  if (!args.body) {
    throw new UploadError(400, "invalid_request_error", "Multipart body required.");
  }

  const reader = args.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
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
        throw new UploadError(
          413,
          "file_too_large",
          "File exceeds the maximum allowed size."
        );
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError(400, "invalid_request_error", "Invalid multipart request.");
  }

  const raw = Buffer.concat(chunks);
  let form: FormData;
  try {
    const synthetic = new Request("http://tokfai.local/admin/aviation/upload", {
      method: "POST",
      headers: { "content-type": args.contentType },
      body: raw,
    });
    form = await synthetic.formData();
  } catch {
    throw new UploadError(400, "invalid_request_error", "Invalid multipart request.");
  }

  const fileField = form.get("file");
  let filename = "upload.bin";
  let bytes: Uint8Array | null = null;

  if (fileField instanceof File) {
    filename = sanitizeFilename(fileField.name || "upload.bin");
    const ab = await fileField.arrayBuffer();
    bytes = new Uint8Array(ab);
  } else if (typeof fileField === "string" && fileField.length > 0) {
    filename = "upload.bin";
    bytes = new Uint8Array(Buffer.from(fileField));
  }

  if (!bytes || bytes.byteLength === 0) {
    throw new UploadError(
      400,
      "invalid_request_error",
      "File is required in multipart field `file`."
    );
  }

  if (bytes.byteLength > args.maxFileBytes) {
    throw new UploadError(
      413,
      "file_too_large",
      "File exceeds the maximum allowed size."
    );
  }

  return { filename, bytes };
}

class UploadError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

let pdftotextAvailable: boolean | null = null;

async function checkPdftotextAvailable(): Promise<boolean> {
  if (pdftotextAvailable !== null) return pdftotextAvailable;
  try {
    await execFileAsync("pdftotext", ["-v"], { timeout: 5000 });
    pdftotextAvailable = true;
  } catch {
    pdftotextAvailable = false;
  }
  return pdftotextAvailable;
}

async function extractPdfText(filePath: string): Promise<FileExtractResult> {
  const filename = path.basename(filePath);
  if (!(await checkPdftotextAvailable())) {
    return { filename, status: "PDFTOTEXT_NOT_INSTALLED", text: "" };
  }
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", filePath, "-"], {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const text = String(stdout ?? "").trim();
    if (!text) {
      return { filename, status: "EMPTY_TEXT", text: "" };
    }
    return { filename, status: "OK", text };
  } catch {
    return { filename, status: "READ_FAILED", text: "" };
  }
}

async function extractTextFile(filePath: string): Promise<FileExtractResult> {
  const filename = path.basename(filePath);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const text = raw.trim();
    if (!text) {
      return { filename, status: "EMPTY_TEXT", text: "" };
    }
    return { filename, status: "OK", text };
  } catch {
    return { filename, status: "READ_FAILED", text: "" };
  }
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function buildExtractMarkdown(args: {
  fileCount: number;
  results: FileExtractResult[];
  extractedFileCount: number;
  totalExtractedChars: number;
}): string {
  const lines: string[] = [
    "TOKFAI_EXTRACT_ATTEMPTED",
    `FILE_COUNT=${args.fileCount}`,
    `EXTRACTED_FILE_COUNT=${args.extractedFileCount}`,
    `TOTAL_EXTRACTED_CHARS=${args.totalExtractedChars}`,
    "",
  ];

  for (const r of args.results) {
    lines.push(`### ${r.filename}`);
    lines.push(`status: ${r.status}`);
    if (r.text) {
      lines.push("");
      lines.push(r.text);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function parseExtractStats(content: string): {
  extractedFileCount: number;
  totalExtractedChars: number;
} {
  let extractedFileCount = 0;
  let totalExtractedChars = 0;
  const efc = content.match(/^EXTRACTED_FILE_COUNT=(\d+)/m);
  const tec = content.match(/^TOTAL_EXTRACTED_CHARS=(\d+)/m);
  if (efc) extractedFileCount = Number(efc[1]) || 0;
  if (tec) totalExtractedChars = Number(tec[1]) || 0;
  return { extractedFileCount, totalExtractedChars };
}

function extractResponsesText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const obj = payload as Record<string, unknown>;

  const output = obj.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const content = entry.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== "object") continue;
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") parts.push(p.text);
        }
      }
      if (typeof entry.text === "string") parts.push(entry.text);
    }
    if (parts.length) return parts.join("\n");
  }

  if (typeof obj.text === "string") return obj.text;

  const choices = obj.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message;
    if (message && typeof message === "object") {
      const m = message as Record<string, unknown>;
      if (typeof m.content === "string") return m.content;
    }
  }

  return JSON.stringify(payload, null, 2);
}

function localApiBaseUrl(): string {
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = env.PORT;
  return `http://${host}:${port}`;
}

async function extractInboxFiles(
  dataRoot: string,
  jobId: string
): Promise<{
  fileCount: number;
  results: FileExtractResult[];
  extractedFileCount: number;
  totalExtractedChars: number;
  extractFilePath: string;
}> {
  const names = await listInboxFileNames(dataRoot, jobId);
  const fileCount = names.length;
  const inbox = inboxDir(dataRoot, jobId);
  const results: FileExtractResult[] = [];
  let totalExtractedChars = 0;
  let extractedFileCount = 0;

  for (const name of names) {
    const ext = extensionOf(name);
    const filePath = path.join(inbox, name);

    let result: FileExtractResult;
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      result = { filename: name, status: "UNSUPPORTED", text: "" };
    } else if (ext === ".pdf") {
      result = await extractPdfText(filePath);
    } else if (TEXT_EXTENSIONS.has(ext)) {
      result = await extractTextFile(filePath);
    } else {
      result = { filename: name, status: "UNSUPPORTED", text: "" };
    }

    if (result.status === "OK" && result.text) {
      const remaining = MAX_TOTAL_CHARS - totalExtractedChars;
      if (remaining <= 0) {
        result = { filename: result.filename, status: "EMPTY_TEXT", text: "" };
      } else {
        const capped = truncateText(
          result.text,
          Math.min(MAX_PER_FILE_CHARS, remaining)
        );
        if (capped.length > 0) {
          result = { filename: result.filename, status: "OK", text: capped };
          extractedFileCount += 1;
          totalExtractedChars += capped.length;
        } else {
          result = { filename: result.filename, status: "EMPTY_TEXT", text: "" };
        }
      }
    }

    results.push(result);
  }

  const extractDir = extractedDir(dataRoot, jobId);
  await fs.mkdir(extractDir, { recursive: true });
  const extractFilePath = extractPath(dataRoot, jobId);
  const markdown = buildExtractMarkdown({
    fileCount,
    results,
    extractedFileCount,
    totalExtractedChars,
  });
  await fs.writeFile(extractFilePath, markdown, "utf8");

  return {
    fileCount,
    results,
    extractedFileCount,
    totalExtractedChars,
    extractFilePath,
  };
}

adminAviationRoutes.post("/jobs", async (c) => {
  const jobId = `av_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const dataRoot = await resolveWritableDataRoot();
  const base = jobBaseDir(dataRoot, jobId);

  await fs.mkdir(inboxDir(dataRoot, jobId), { recursive: true });
  await fs.mkdir(extractedDir(dataRoot, jobId), { recursive: true });
  await fs.mkdir(resultsDir(dataRoot, jobId), { recursive: true });

  const meta: JobMeta = {
    jobId,
    status: "created",
    dataRoot,
    createdAt: new Date().toISOString(),
  };
  await writeJobMeta(dataRoot, meta);

  return c.json({ jobId, status: "created" });
});

adminAviationRoutes.post("/jobs/:jobId/files", async (c) => {
  const jobId = c.req.param("jobId");
  if (!isValidJobId(jobId)) {
    return c.json({ error: "job_not_found", message: "Invalid job ID." }, 404);
  }

  const dataRoot = await findJobDataRoot(jobId);
  if (!dataRoot) {
    return c.json({ error: "job_not_found", message: "Job not found." }, 404);
  }

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return c.json(
      {
        error: "invalid_request_error",
        message: "Upload requires multipart/form-data with field `file`.",
      },
      400
    );
  }

  let parsed: { filename: string; bytes: Uint8Array };
  try {
    parsed = await readMultipartFileWithLimit({
      contentType,
      contentLengthHeader: c.req.header("content-length"),
      body: c.req.raw.body,
      maxFileBytes: MAX_FILE_BYTES,
    });
  } catch (err) {
    if (err instanceof UploadError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
    throw err;
  }

  const ext = extensionOf(parsed.filename);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return c.json(
      {
        error: "unsupported_file_type",
        message: `Unsupported file type: ${ext || "(none)"}`,
      },
      415
    );
  }

  const dest = path.join(inboxDir(dataRoot, jobId), parsed.filename);
  await fs.writeFile(dest, parsed.bytes);

  const meta = (await readJobMeta(dataRoot, jobId)) ?? {
    jobId,
    status: "uploaded",
    dataRoot,
    createdAt: new Date().toISOString(),
  };
  meta.status = "uploaded";
  await writeJobMeta(dataRoot, meta);

  const files = await listInboxFilesDetailed(dataRoot, jobId);
  return c.json({ jobId, status: "uploaded", files });
});

adminAviationRoutes.post("/jobs/:jobId/analyze", async (c) => {
  const jobId = c.req.param("jobId");
  if (!isValidJobId(jobId)) {
    return c.json({ error: "job_not_found", message: "Invalid job ID." }, 404);
  }

  const dataRoot = await findJobDataRoot(jobId);
  if (!dataRoot) {
    return c.json({ error: "job_not_found", message: "Job not found." }, 404);
  }

  const extracted = await extractInboxFiles(dataRoot, jobId);

  if (extracted.fileCount === 0) {
    return c.json(
      {
        error: "NO_FILES_UPLOADED",
        message: "No files uploaded for this job.",
      },
      400
    );
  }

  if (
    extracted.extractedFileCount === 0 ||
    extracted.totalExtractedChars < MIN_EXTRACT_CHARS_FOR_MODEL
  ) {
    return c.json(
      {
        error: "NO_EXTRACTED_TEXT",
        message:
          "No readable file content was extracted. Upload real files or check file type.",
        fileCount: extracted.fileCount,
        extractedFileCount: extracted.extractedFileCount,
        totalExtractedChars: extracted.totalExtractedChars,
        extractPath: extracted.extractFilePath,
      },
      422
    );
  }

  const contentSections: string[] = [];
  for (const r of extracted.results) {
    if (r.status === "OK" && r.text) {
      contentSections.push(`--- FILE: ${r.filename} ---\n${r.text}`);
    }
  }

  const prompt = [
    "Analyze the following customer-uploaded file content for aviation intake diagnosis.",
    "The content below was extracted from uploaded files. Do not request file paths.",
    "",
    contentSections.join("\n\n"),
    "",
    "Provide a structured diagnosis based only on the extracted content above.",
    "Your final line must be exactly:",
    "TOKFAI_P1285_SERVER_FILE_INTAKE_DONE",
  ].join("\n");

  const auth = c.req.header("authorization");
  const responsesUrl = `${localApiBaseUrl()}/v1/responses`;
  const upstreamRes = await fetch(responsesUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      input: prompt,
      stream: false,
    }),
  });

  const rawText = await upstreamRes.text();
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    rawJson = { raw: rawText };
  }

  const resultsPath = resultsDir(dataRoot, jobId);
  await fs.mkdir(resultsPath, { recursive: true });
  await fs.writeFile(rawResultPath(dataRoot, jobId), JSON.stringify(rawJson, null, 2));

  if (!upstreamRes.ok) {
    const errBody =
      rawJson && typeof rawJson === "object"
        ? (rawJson as Record<string, unknown>)
        : { message: rawText };
    return c.json(
      {
        error: "MODEL_CALL_FAILED",
        message: "Upstream /v1/responses call failed.",
        upstreamStatus: upstreamRes.status,
        detail: errBody,
        extractPath: extracted.extractFilePath,
      },
      502
    );
  }

  const diagnosisText = extractResponsesText(rawJson);
  await fs.writeFile(diagnosisPath(dataRoot, jobId), diagnosisText, "utf8");

  const meta = (await readJobMeta(dataRoot, jobId)) ?? {
    jobId,
    status: "analyzed",
    dataRoot,
    createdAt: new Date().toISOString(),
  };
  meta.status = "analyzed";
  meta.extractedFileCount = extracted.extractedFileCount;
  meta.totalExtractedChars = extracted.totalExtractedChars;
  await writeJobMeta(dataRoot, meta);

  return c.json({
    jobId,
    status: "analyzed",
    fileCount: extracted.fileCount,
    extractedFileCount: extracted.extractedFileCount,
    totalExtractedChars: extracted.totalExtractedChars,
    extractPath: extracted.extractFilePath,
    diagnosisPath: diagnosisPath(dataRoot, jobId),
  });
});

adminAviationRoutes.get("/jobs/:jobId/status", async (c) => {
  const jobId = c.req.param("jobId");
  if (!isValidJobId(jobId)) {
    return c.json({ error: "job_not_found", message: "Invalid job ID." }, 404);
  }

  const dataRoot = await findJobDataRoot(jobId);
  if (!dataRoot) {
    return c.json({ error: "job_not_found", message: "Job not found." }, 404);
  }

  const meta = await readJobMeta(dataRoot, jobId);
  const fileCount = (await listInboxFileNames(dataRoot, jobId)).length;
  const extractFile = extractPath(dataRoot, jobId);
  const diagnosisFile = diagnosisPath(dataRoot, jobId);

  let hasExtract = false;
  let hasResult = false;
  let extractedFileCount = meta?.extractedFileCount ?? 0;
  let totalExtractedChars = meta?.totalExtractedChars ?? 0;

  try {
    await fs.access(extractFile);
    hasExtract = true;
    const content = await fs.readFile(extractFile, "utf8");
    const stats = parseExtractStats(content);
    if (stats.extractedFileCount > 0 || stats.totalExtractedChars > 0) {
      extractedFileCount = stats.extractedFileCount;
      totalExtractedChars = stats.totalExtractedChars;
    }
  } catch {
    // no extract
  }

  try {
    await fs.access(diagnosisFile);
    hasResult = true;
  } catch {
    // no result
  }

  return c.json({
    jobId,
    status: meta?.status ?? "created",
    fileCount,
    hasExtract,
    hasResult,
    extractedFileCount,
    totalExtractedChars,
  });
});

adminAviationRoutes.get("/jobs/:jobId/result", async (c) => {
  const jobId = c.req.param("jobId");
  if (!isValidJobId(jobId)) {
    return c.json({ error: "job_not_found", message: "Invalid job ID." }, 404);
  }

  const dataRoot = await findJobDataRoot(jobId);
  if (!dataRoot) {
    return c.json({ error: "job_not_found", message: "Job not found." }, 404);
  }

  const extractFile = extractPath(dataRoot, jobId);
  const diagnosisFile = diagnosisPath(dataRoot, jobId);

  let hasExtract = false;
  try {
    await fs.access(extractFile);
    hasExtract = true;
  } catch {
    // no extract
  }

  try {
    const diagnosis = await fs.readFile(diagnosisFile, "utf8");
    return c.text(diagnosis, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
  } catch {
    if (hasExtract) {
      return c.json(
        {
          error: "NO_DIAGNOSIS_RESULT",
          message: "Diagnosis was not generated. Check extract result first.",
          extractPath: extractFile,
        },
        422
      );
    }
    return c.json({ error: "not_found", message: "Job result not found." }, 404);
  }
});
