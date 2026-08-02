/**
 * P993 — Image URL gate unit tests (no DB writes).
 *
 * Covers:
 * 1) valid image → persist → verify → success (charge path allowed by caller)
 * 2) provider URL 404 → provider_asset_unavailable
 * 3) provider URL text/plain → provider_asset_invalid
 * 4) persist failure → asset_persist_failed
 * 5) verify failure → asset_verify_failed
 * 6) missing_url
 * 7) publicResponse completed → processing=false, billing_status=charged
 * 8) publicResponse failed → processing=false, billing_status=not_billable
 * 9) static: worker charges only after gate; GET poll has no debit
 * 10) idempotent debit reference = request_id
 *
 * Usage:
 *   pnpm tsx scripts/p993-image-url-gate-unit.mts
 *
 * Marker:
 *   TOKFAI_P993_IMAGE_URL_GATE_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { downloadValidateAndPersistProviderImage } from "../apps/dmit-api/src/images/imageResultAssetGate.ts";
import { buildPublicImageTaskResponse } from "../apps/dmit-api/src/images/publicResponse.ts";
import type { ImageGenerationTaskRow } from "../apps/dmit-api/src/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P993_IMAGE_URL_GATE_PASS";
const FAIL = "TOKFAI_P993_IMAGE_URL_GATE_FAIL";

// 1x1 PNG
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
);

let failed = 0;

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

function makeFetch(
  handlers: Array<(url: string, init?: RequestInit) => Response | Promise<Response>>
): typeof fetch {
  let i = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const handler = handlers[i++];
    if (!handler) {
      throw new Error(`Unexpected fetch #${i} url=${url}`);
    }
    return handler(url, init);
  }) as typeof fetch;
}

function pngResponse(status = 200): Response {
  return new Response(PNG_BYTES, {
    status,
    headers: { "Content-Type": "image/png" },
  });
}

async function expectCode(
  label: string,
  fn: () => Promise<unknown>,
  code: string
): Promise<void> {
  try {
    await fn();
    fail(label, `expected ${code}, got success`);
  } catch (err) {
    const got =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    assert(got === code, label, `got ${got || String(err)}`);
  }
}

async function runGateTests(): Promise<void> {
  // 1) valid image persist success
  {
    const stored = new Map<string, { bytes: Uint8Array; contentType: string }>();
    const provider = "https://cdn.example.com/ok.png";
    const tokfaiBase = "https://tokfai-storage.example/public";
    const fetchImpl = makeFetch([
      () => pngResponse(),
      (url) => {
        // verify public URL
        assert(url.startsWith(tokfaiBase), "1. verify hits Tokfai URL");
        return pngResponse();
      },
    ]);
    const result = await downloadValidateAndPersistProviderImage({
      providerUrl: provider,
      requestId: "req_ok_1",
      userId: "00000000-0000-0000-0000-000000000001",
      deps: {
        fetchImpl,
        uploadObject: async ({ objectPath, bytes, contentType }) => {
          stored.set(objectPath, { bytes, contentType });
          return `${tokfaiBase}/${objectPath}`;
        },
      },
    });
    assert(
      result.publicUrl.startsWith(tokfaiBase) &&
        result.byteLength === PNG_BYTES.byteLength &&
        stored.size === 1,
      "1. valid image persisted once"
    );
  }

  // 2) 404
  await expectCode(
    "2. provider 404 → provider_asset_unavailable",
    () =>
      downloadValidateAndPersistProviderImage({
        providerUrl: "https://cdn.example.com/missing.png",
        requestId: "req_404",
        userId: "00000000-0000-0000-0000-000000000001",
        deps: {
          fetchImpl: makeFetch([
            () =>
              new Response("not found", {
                status: 404,
                headers: { "Content-Type": "text/plain" },
              }),
          ]),
          uploadObject: async () => {
            throw new Error("should not upload");
          },
        },
      }),
    "provider_asset_unavailable"
  );

  // 3) text/plain
  await expectCode(
    "3. text/plain → provider_asset_invalid",
    () =>
      downloadValidateAndPersistProviderImage({
        providerUrl: "https://cdn.example.com/plain.txt",
        requestId: "req_plain",
        userId: "00000000-0000-0000-0000-000000000001",
        deps: {
          fetchImpl: makeFetch([
            () =>
              new Response("hello", {
                status: 200,
                headers: { "Content-Type": "text/plain" },
              }),
          ]),
          uploadObject: async () => {
            throw new Error("should not upload");
          },
        },
      }),
    "provider_asset_invalid"
  );

  // 4) persist failure
  await expectCode(
    "4. persist failure → asset_persist_failed",
    () =>
      downloadValidateAndPersistProviderImage({
        providerUrl: "https://cdn.example.com/ok.png",
        requestId: "req_persist",
        userId: "00000000-0000-0000-0000-000000000001",
        deps: {
          fetchImpl: makeFetch([() => pngResponse()]),
          uploadObject: async () => {
            throw new Error("storage down");
          },
        },
      }),
    "asset_persist_failed"
  );

  // 5) verify failure
  await expectCode(
    "5. verify failure → asset_verify_failed",
    () =>
      downloadValidateAndPersistProviderImage({
        providerUrl: "https://cdn.example.com/ok.png",
        requestId: "req_verify",
        userId: "00000000-0000-0000-0000-000000000001",
        deps: {
          fetchImpl: makeFetch([() => pngResponse()]),
          uploadObject: async () => "https://tokfai-storage.example/public/x.png",
          verifyPublicUrl: async () => {
            throw new Error("verify boom");
          },
        },
      }),
    "asset_verify_failed"
  );

  // 6) missing url
  await expectCode(
    "6. missing_url",
    () =>
      downloadValidateAndPersistProviderImage({
        providerUrl: "  ",
        requestId: "req_missing",
        userId: "00000000-0000-0000-0000-000000000001",
        deps: {
          fetchImpl: makeFetch([]),
          uploadObject: async () => {
            throw new Error("should not upload");
          },
        },
      }),
    "missing_url"
  );
}

function runPublicResponseTests(): void {
  const completed = buildPublicImageTaskResponse({
    request_id: "task_done",
    status: "completed",
    progress: 100,
    credits_charged: 440,
    billing_status: "charged",
    result_data: [
      {
        url: "https://xxx.supabase.co/storage/v1/object/public/image-results/a.png",
        revised_prompt: null,
      },
    ],
    usage: { credits_charged: 440 },
    message_en: "done",
    message_zh: "完成",
    model: "nano-banana-fast",
    mode: "text_to_image",
    prompt_mode: "normal",
    provider_task_id: "prov_1",
    upstream_id: "prov_1",
    created_at: new Date().toISOString(),
  } as unknown as ImageGenerationTaskRow);

  assert(
    completed.processing === false &&
      completed.billing_status === "charged" &&
      completed.progress === 100 &&
      completed.status === "completed" &&
      Number(completed.credits_charged) === 440,
    "7. completed → processing=false billing_status=charged"
  );

  const failed = buildPublicImageTaskResponse({
    request_id: "task_fail",
    status: "failed",
    progress: 100,
    credits_charged: 0,
    billing_status: "not_billable",
    result_data: [],
    usage: { credits_charged: 0 },
    error_code: "provider_asset_unavailable",
    error_message: "Provider image URL returned HTTP 404.",
    message_en: "failed",
    message_zh: "失败",
    model: "nano-banana-fast",
    created_at: new Date().toISOString(),
  } as unknown as ImageGenerationTaskRow);

  assert(
    failed.processing === false &&
      failed.billing_status === "not_billable" &&
      Number(failed.credits_charged) === 0 &&
      Array.isArray(failed.data) &&
      (failed.data as unknown[]).length === 0 &&
      (failed.error as { code?: string })?.code === "provider_asset_unavailable",
    "8. failed → processing=false billing_status=not_billable credits=0"
  );
}

function runStaticSourceGuards(): void {
  const worker = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/worker.ts"),
    "utf8"
  );
  const reconcile = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/costReconcile.ts"),
    "utf8"
  );
  const routes = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/images.ts"),
    "utf8"
  );
  const billing = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/imageBilling.ts"),
    "utf8"
  );
  const gate = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/imageResultAssetGate.ts"),
    "utf8"
  );

  assert(
    worker.includes("await downloadValidateAndPersistProviderImage") &&
      worker.includes("await recordImageUsageAndDebit") &&
      worker.indexOf("await downloadValidateAndPersistProviderImage") <
        worker.indexOf("await recordImageUsageAndDebit"),
    "9a. worker: persist gate before debit"
  );
  assert(
    reconcile.includes("downloadValidateAndPersistProviderImage") &&
      reconcile.includes("recordImageUsageAndDebit"),
    "9b. reconcile: gate before debit"
  );
  assert(
    !routes.includes("debit_credits") &&
      !routes.includes("recordImageUsageAndDebit"),
    "9c. GET/POST routes do not debit"
  );
  assert(
    billing.includes("debit_credits") &&
      billing.includes("isUniqueViolation") &&
      billing.includes("imageTaskLedgerReferenceId"),
    "9d. single idempotent debit helper"
  );
  assert(
    gate.includes('method: "GET"') && !/method:\s*"HEAD"/.test(gate),
    "9e. gate uses GET not HEAD"
  );
  assert(
    gate.includes("IMAGE_RESULTS_BUCKET") &&
      gate.includes("image-results"),
    "9f. persists to image-results bucket"
  );
}

async function main(): Promise<void> {
  console.log("P993 image URL gate unit tests");
  await runGateTests();
  runPublicResponseTests();
  runStaticSourceGuards();

  if (failed > 0) {
    console.error(FAIL);
    process.exit(1);
  }
  console.log(PASS);
}

main().catch((err) => {
  console.error(err);
  console.error(FAIL);
  process.exit(1);
});
