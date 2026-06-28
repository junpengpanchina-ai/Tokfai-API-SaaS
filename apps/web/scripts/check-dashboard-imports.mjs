#!/usr/bin/env node
/**
 * Enforces dashboard-safe import boundary for app/dashboard routes.
 * Optionally scans build output when .next exists (after npm run build).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = join(__dirname, "..");
const DASHBOARD_ROOT = join(WEB_ROOT, "app", "dashboard");

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
  {
    id: "customer-quick-start-snippets",
    pattern: /customer-quick-start-snippets/,
  },
  { id: "customer-cherry-chapter", pattern: /customer-cherry-chapter/ },
  { id: "customer-cursor-chapter", pattern: /customer-cursor-chapter/ },
  {
    id: "customer-integration-snippets",
    pattern: /customer-integration-snippets/,
  },
  { id: "useQuickStartApiKey", pattern: /useQuickStartApiKey/ },
  { id: "@/lib/model-catalog", pattern: /@\/lib\/model-catalog/ },
];

const BUILD_BANNED = [
  "customer-cherry",
  "customer-cursor",
  "customer-integration-snippets",
  "customer-quick-start-snippets",
  "customer-troubleshooting",
  "i18n/messages",
  "useQuickStartApiKey",
  "chapterFailure",
  "whenChatTitle",
  "model-catalog",
];

function walkFiles(dir, acc = []) {
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

function scanSourceFiles() {
  if (!existsSync(DASHBOARD_ROOT)) {
    throw new Error(`Dashboard root not found: ${DASHBOARD_ROOT}`);
  }

  const violations = [];
  const files = walkFiles(DASHBOARD_ROOT);

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (const rule of SOURCE_BANNED) {
      lines.forEach((line, index) => {
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
    if (/\.(js|json)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function scanBuildOutput() {
  const violations = [];
  const targets = [
    join(WEB_ROOT, ".next", "server", "app", "dashboard"),
    join(WEB_ROOT, ".next", "static", "chunks", "app", "dashboard"),
  ];

  for (const root of targets) {
    for (const file of walkBuildFiles(root)) {
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
    const buildViolations = scanBuildOutput();
    if (buildViolations.length > 0) {
      failed = true;
      console.error("Dashboard build chunk violations:");
      for (const v of buildViolations) {
        console.error(`  ${v.file} contains banned string: ${v.rule}`);
      }
      console.error("");
    } else {
      console.log("Dashboard build chunk check passed.");
    }
  } else {
    console.log("Skipping build chunk check (.next not found — run npm run build first).");
  }

  if (failed) {
    process.exit(1);
  }
}

main();
