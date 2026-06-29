#!/usr/bin/env node
/**
 * P828 dashboard import boundary — source + build chunk scan.
 *
 * Dashboard client islands may only pull shared logic from lib/dashboard-safe.
 * Server pages under app/dashboard may use dmit/server and supabase/server.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = join(__dirname, "..");

const SOURCE_SCAN_ROOTS = [
  join(WEB_ROOT, "app", "dashboard"),
  join(WEB_ROOT, "lib", "dashboard-safe"),
];

const SHARED_CLIENT_COMPONENTS = [
  "usage-view-client.tsx",
  "credits-content-client.tsx",
  "auth-success-toast.tsx",
];

const SOURCE_BANNED = [
  { id: "@/lib/customer-", pattern: /@\/lib\/customer-/ },
  { id: "@/components/customer-", pattern: /@\/components\/customer-/ },
  { id: "@/lib/i18n/messages", pattern: /@\/lib\/i18n\/messages/ },
  { id: "@/lib/i18n/i18n-provider", pattern: /@\/lib\/i18n\/i18n-provider/ },
  { id: "@/components/copy-code-block", pattern: /@\/components\/copy-code-block/ },
  {
    id: "@/components/copyable-snippet-field",
    pattern: /@\/components\/copyable-snippet-field/,
  },
  { id: "@/lib/model-catalog", pattern: /@\/lib\/model-catalog/ },
  { id: "@/lib/dmit-messages", pattern: /@\/lib\/dmit-messages/ },
  { id: "@/lib/dmit-error-details", pattern: /@\/lib\/dmit-error-details/ },
  { id: "@/lib/integration-snippets", pattern: /@\/lib\/integration-snippets/ },
  {
    id: "customer-quick-start-snippets",
    pattern: /customer-quick-start-snippets/,
  },
  { id: "quick-start-snippets", pattern: /quick-start-snippets/ },
  { id: "customer-cherry", pattern: /customer-cherry/ },
  { id: "customer-cursor", pattern: /customer-cursor/ },
  { id: "customer-integration", pattern: /customer-integration/ },
  { id: "useQuickStartApiKey", pattern: /useQuickStartApiKey/ },
];

const CLIENT_ONLY_BANNED = [
  { id: "@/lib/dmit/", pattern: /@\/lib\/dmit\// },
  { id: "@/lib/supabase/client", pattern: /@\/lib\/supabase\/client/ },
  { id: "@/lib/tokfai-api", pattern: /@\/lib\/tokfai-api/ },
  { id: "@/lib/playground-risk-errors", pattern: /@\/lib\/playground-risk-errors/ },
  { id: "@/lib/storage/upload-image", pattern: /@\/lib\/storage\/upload-image/ },
  { id: "@/lib/model-catalog", pattern: /@\/lib\/model-catalog/ },
  { id: "@/lib/dashboard-display-helpers", pattern: /@\/lib\/dashboard-display-helpers/ },
  { id: "@/lib/dashboard-shell-credits", pattern: /@\/lib\/dashboard-shell-credits/ },
  { id: "@/lib/dashboard-shell-format", pattern: /@\/lib\/dashboard-shell-format/ },
  { id: "@/lib/billing/", pattern: /@\/lib\/billing\// },
  { id: "@/lib/credits", pattern: /@\/lib\/credits/ },
  { id: "@/lib/usage-page", pattern: /@\/lib\/usage-page/ },
  { id: "@/lib/models-page", pattern: /@\/lib\/models-page/ },
  { id: "@/lib/models-page-server", pattern: /@\/lib\/models-page-server/ },
];

const CLIENT_LIB_ALLOWLIST =
  /^@\/lib\/(dashboard-safe|auth\/auth-provider)(\/|$)/;

const BUILD_BANNED = [
  "customer-",
  "customer_",
  "quick-start-snippets",
  "customer-quick-start-snippets",
  "customer-cherry",
  "customer-cursor",
  "customer-integration",
  "chapterFailure",
  "whenChatTitle",
  "i18n/messages",
  "model-catalog",
  "copy-code-block",
  "copyable-snippet-field",
  "dmit-error-details",
  "dmit-messages",
  "lib/dmit/client",
  "lib/supabase/client",
  "createBrowserSupabase",
];

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function collectDashboardComponentFiles() {
  const componentsDir = join(WEB_ROOT, "components");
  if (!existsSync(componentsDir)) return [];
  return readdirSync(componentsDir)
    .filter((name) => name.startsWith("dashboard-") && /\.(ts|tsx)$/.test(name))
    .map((name) => join(componentsDir, name));
}

function collectSharedDashboardClientFiles() {
  const componentsDir = join(WEB_ROOT, "components");
  return SHARED_CLIENT_COMPONENTS.map((name) => join(componentsDir, name)).filter(
    (path) => existsSync(path)
  );
}

function isSkippableLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/**") ||
    trimmed.startsWith("*/")
  );
}

function isClientModule(content) {
  return /^["']use client["'];?\s*$/m.test(content.split("\n").slice(0, 3).join("\n"));
}

function scanImportLine(line, rules, file, violations) {
  if (isSkippableLine(line)) return;
  for (const rule of rules) {
    if (rule.pattern.test(line)) {
      violations.push({
        file: relative(WEB_ROOT, file),
        line: null,
        rule: rule.id,
        text: line.trim(),
      });
    }
  }
}

function scanClientLibImports(content, file, violations) {
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (isSkippableLine(line)) return;
    const fromMatch = line.match(/from\s+["'](@\/lib\/[^"']+)["']/);
    if (!fromMatch) return;
    const spec = fromMatch[1];
    if (CLIENT_LIB_ALLOWLIST.test(spec)) return;
    violations.push({
      file: relative(WEB_ROOT, file),
      line: index + 1,
      rule: "client-lib-allowlist",
      text: `Dashboard client may only import @/lib/dashboard-safe/* (found ${spec})`,
    });
  });
}

function scanSourceFiles() {
  const violations = [];
  const allFiles = [
    ...SOURCE_SCAN_ROOTS.flatMap((root) => walkFiles(root)),
    ...collectDashboardComponentFiles(),
    ...collectSharedDashboardClientFiles(),
  ];

  for (const file of allFiles) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    const isClient = isClientModule(content);
    const rules = isClient
      ? [...SOURCE_BANNED, ...CLIENT_ONLY_BANNED]
      : SOURCE_BANNED;

    for (const rule of rules) {
      lines.forEach((line, index) => {
        if (isSkippableLine(line)) return;
        if (rule.pattern.test(line)) {
          violations.push({
            file: relative(WEB_ROOT, file),
            line: index + 1,
            rule: rule.id,
            text: line.trim(),
          });
        }
      });
    }

    if (isClient) {
      scanClientLibImports(content, file, violations);
    }
  }

  return violations;
}

function walkBuildFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkBuildFiles(full, acc);
      continue;
    }
    if (/\.js$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function scanBuildChunks() {
  const violations = [];
  const chunkRoot = join(WEB_ROOT, ".next", "static", "chunks", "app", "dashboard");
  for (const file of walkBuildFiles(chunkRoot)) {
    const content = readFileSync(file, "utf8");
    for (const banned of BUILD_BANNED) {
      if (content.includes(banned)) {
        violations.push({
          file: relative(WEB_ROOT, file),
          rule: banned,
        });
      }
    }
  }
  return violations;
}

function main() {
  let failed = false;

  const sourceViolations = scanSourceFiles();
  if (sourceViolations.length > 0) {
    failed = true;
    console.error("Dashboard source import violations:");
    for (const v of sourceViolations) {
      const loc = v.line != null ? `${v.file}:${v.line}` : v.file;
      console.error(`  ${loc} [${v.rule}] ${v.text}`);
    }
    console.error("");
  } else {
    console.log("Dashboard source import check passed.");
  }

  const nextDir = join(WEB_ROOT, ".next");
  if (existsSync(nextDir)) {
    const buildViolations = scanBuildChunks();
    if (buildViolations.length > 0) {
      failed = true;
      console.error("Dashboard static chunk violations:");
      for (const v of buildViolations) {
        console.error(`  ${v.file} contains banned string: ${v.rule}`);
      }
      console.error("");
    } else {
      console.log("Dashboard static chunk check passed.");
    }
  } else {
    console.log(
      "Skipping static chunk check (.next not found — run npm run build first)."
    );
  }

  if (failed) process.exit(1);
}

main();
