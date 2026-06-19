#!/usr/bin/env node
/**
 * Internal operator smoke only — not customer documentation.
 * Customers use API Key + one-line curl from Dashboard; they never run this script.
 *
 * P778 / P786 — scan customer-visible web source for internal engineering terms.
 * Usage: node scripts/p778-docs-customer-visible-grep.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  join(ROOT, "apps/web/components"),
  join(ROOT, "apps/web/lib"),
  join(ROOT, "apps/web/app/dashboard"),
  join(ROOT, "apps/web/app/docs"),
];

const IGNORE_PATH_PARTS = [
  "/admin/",
  "/node_modules/",
  ".test.",
  ".spec.",
  "/lib/dmit/",
  "/app/admin/",
  "/dashboard/admin/",
];

const RULES = [
  { label: "/Users path", pattern: /\/Users(?:\/[A-Za-z0-9._-]+)?/ },
  { label: "/opt/tokfai", pattern: /\/opt\/tokfai/ },
  { label: "P77 ticket", pattern: /\bP7[789]\d*[\d.]*\b/ },
  { label: "P80 ticket", pattern: /\bP80\d*[\d.]*\b/ },
  { label: "server banned", pattern: /server\s+banned/i },
  { label: "解封", pattern: /解封/ },
  { label: "GitHub", pattern: /\bGitHub\b/i },
  { label: "artifact", pattern: /\bartifact\b/i },
  { label: "internal runbook", pattern: /internal\s+runbook/i },
  { label: "runbook", pattern: /\brunbook\b/i },
  { label: "production acceptance", pattern: /production\s+acceptance/i },
  { label: "TOKFAI_SUPABASE_JWT", pattern: /TOKFAI_SUPABASE_JWT/ },
  { label: "SUPABASE_ACCESS_TOKEN", pattern: /SUPABASE_ACCESS_TOKEN/ },
  { label: "internal smoke", pattern: /internal\s+smoke/i },
  { label: "operator smoke", pattern: /operator\s+smoke/i },
  { label: "operator (word)", pattern: /\boperator\b/i },
  { label: "scripts/p prefix", pattern: /scripts\/p\d/i },
  { label: "production smoke", pattern: /production\s+smoke/i },
  { label: "acceptance artifact", pattern: /acceptance\s+artifact/i },
  { label: "checklist artifact", pattern: /checklist\s+artifact/i },
  { label: "local repo", pattern: /local\s+repo/i },
  { label: "checklist", pattern: /\bchecklist\b/i },
  { label: "本地仓库", pattern: /本地仓库/ },
  { label: "工程路径", pattern: /工程路径/ },
  { label: "帮你运营", pattern: /帮你运营/ },
  { label: "替你经营", pattern: /替你经营/ },
  { label: "托管运营", pattern: /托管运营/ },
  { label: "服务器部署", pattern: /服务器部署/ },
  { label: "node scripts", pattern: /node\s+scripts\b/i },
  { label: "scripts (word)", pattern: /\bscripts\b/i },
  { label: "DMIT", pattern: /\bDMIT\b/i },
  { label: "repo (word)", pattern: /\brepo\b/i },
  { label: "commit (word)", pattern: /\bcommit\b/i },
  { label: "mock gateway", pattern: /\bmock\s+gateway\b/i },
  { label: "mock acceptance", pattern: /\bmock\s+acceptance\b/i },
  { label: "commit hash", pattern: /\bcommit\s+hash\b/i },
  { label: "git push", pattern: /\bgit\s+push\b/i },
];

const ALLOW_SUBSTRINGS = [
  "no clone",
  "no cd",
  "无需 clone",
  "无需 cd",
  "not a repo",
  "no Tokfai repository",
  "no Tokfai repo",
  "无需 Tokfai 仓库",
  "不是代运营",
  "不代运营",
  "cd 到任何目录",
  "无需进入任何 Tokfai 工程目录",
  "no operator command-line",
  "无需运行仓库里的命令行",
  "no repository checkout",
  "No repository",
  "无需 clone 仓库",
  "无需 cd 到任何文件夹",
  "业务由您自行运营",
  "you run your apps",
  "you operate your",
  "no scripts",
  "无需 scripts",
  "no git",
  "无需 git",
  "no commit",
];

function shouldIgnorePath(path) {
  const rel = relative(ROOT, path);
  return IGNORE_PATH_PARTS.some((part) => rel.includes(part.replace(/^\//, "")));
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/**");
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (shouldIgnorePath(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) files.push(full);
  }
  return files;
}

function isAllowed(line) {
  return ALLOW_SUBSTRINGS.some((snippet) => line.includes(snippet));
}

function isCustomerMessagesLine(line, rel) {
  if (rel === "apps/web/lib/i18n/troubleshooting-case-messages.ts") return true;
  if (line.includes("admin.")) return false;
  if (line.includes("integration.")) return true;
  if (line.includes("apiReadiness.")) return true;
  if (line.includes("liveVerification")) return true;
  if (line.includes("dashboard.apiKeys")) return true;
  if (line.includes("dashboard.models")) return true;
  if (line.includes("integration.capacity")) return true;
  if (line.includes("apiKeys:") && line.includes("copy")) return true;
  return false;
}

const hits = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file);
    if (rel.endsWith("troubleshooting-case-messages.ts")) continue;
    if (rel.endsWith("starter-template-messages.ts")) continue;
    if (rel.endsWith("payload-builder-field-messages.ts")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;
      if (isAllowed(line)) continue;
      if (rel === "apps/web/lib/i18n/messages.ts" && !isCustomerMessagesLine(line, rel)) continue;

      for (const rule of RULES) {
        if (!rule.pattern.test(line)) continue;
        if (rule.label === "/Users path" && /\/admin\/users/.test(line)) continue;
        if (rule.label === "repo (word)" && /\breport\b/i.test(line)) continue;
        if (rule.label === "commit (word)" && /nextUrl\.clone/.test(line)) continue;
        if (rule.label === "DMIT" && /import\s.*dmit/i.test(line)) continue;
        if (rule.label === "DMIT" && /from\s+["']@\/lib\/dmit/i.test(line)) continue;
        if (rule.label === "DMIT" && /DmitApi/i.test(line)) continue;

        if (rule.label === "git push" && /push\s+back/i.test(line)) continue;
        if (rule.label === "git push" && /no git/i.test(line)) continue;
        if (rule.label === "commit hash" && /no commit/i.test(line)) continue;
        if (rule.label === "commit (word)" && /no commit/i.test(line)) continue;
        if (rule.label === "operator (word)" && /operate your/i.test(line)) continue;
        if (rule.label === "operator (word)" && /自行运营/i.test(line)) continue;
        if (rule.label === "operator (word)" && /代运营/i.test(line)) continue;
        if (rule.label === "scripts (word)" && /no scripts/i.test(line)) continue;

        hits.push({
          file: rel,
          line: i + 1,
          rule: rule.label,
          text: line.trim().slice(0, 240),
        });
      }
    }
  }
}

if (hits.length === 0) {
  console.log("P778 customer-visible grep: PASS (0 hits)");
  process.exit(0);
}

console.error(`P778 customer-visible grep: FAIL (${hits.length} hits)`);
for (const hit of hits) {
  console.error(`${hit.file}:${hit.line} [${hit.rule}] ${hit.text}`);
}
process.exit(1);
