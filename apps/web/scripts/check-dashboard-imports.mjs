#!/usr/bin/env node
/**
 * Hard dashboard import boundary — source + build chunk scan.
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

function isSkippableLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/**") ||
    trimmed.startsWith("*/")
  );
}

function scanSourceFiles() {
  const violations = [];
  const files = [
    ...SOURCE_SCAN_ROOTS.flatMap((root) => walkFiles(root)),
    ...collectDashboardComponentFiles(),
  ];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (const rule of SOURCE_BANNED) {
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
      console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`);
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
