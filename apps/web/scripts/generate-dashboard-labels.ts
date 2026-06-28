/**
 * Generates dashboard-safe flat labels from i18n messages for dashboard UI keys.
 * Run: npx tsx scripts/generate-dashboard-labels.ts
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { messages } from "../lib/i18n/messages";

const OUT = join(process.cwd(), "lib", "dashboard-safe", "labels.generated.ts");

const SCAN_ROOTS = [
  join(process.cwd(), "app", "dashboard"),
  join(process.cwd(), "components"),
];

const EXTRA_FILES = [
  join(process.cwd(), "components", "usage-view-client.tsx"),
  join(process.cwd(), "components", "credits-content-client.tsx"),
  join(process.cwd(), "components", "auth-success-toast.tsx"),
];

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      if (dir.endsWith("components") && entry.startsWith("dashboard-")) {
        acc.push(full);
      } else if (!dir.endsWith("components")) {
        acc.push(full);
      }
    }
  }
  return acc;
}

function collectTranslationKeys(): Set<string> {
  const keys = new Set<string>();
  const keyPattern = /\bt\(\s*["'`]([^"'`]+)["'`]/g;

  const files = [
    ...SCAN_ROOTS.flatMap((root) => walkFiles(root)),
    ...EXTRA_FILES.filter((f) => existsSync(f)),
  ];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(keyPattern)) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function getByPath(tree: Record<string, unknown>, path: string): string | undefined {
  let cur: unknown = tree;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function escapeString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function renderMap(name: string, entries: Record<string, string>): string {
  const lines = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `  "${escapeString(key)}": "${escapeString(value)}",`);
  return `const ${name}: Record<string, string> = {\n${lines.join("\n")}\n};`;
}

function main() {
  const keys = collectTranslationKeys();
  const en: Record<string, string> = {};
  const zh: Record<string, string> = {};
  const missing: string[] = [];

  for (const key of [...keys].sort()) {
    const enValue = getByPath(messages.en as Record<string, unknown>, key);
    const zhValue = getByPath(messages.zh as Record<string, unknown>, key);
    if (enValue) en[key] = enValue;
    else missing.push(key);
    if (zhValue) zh[key] = zhValue;
    else if (enValue) zh[key] = enValue;
  }

  if (missing.length > 0) {
    console.warn("Missing EN labels for keys:");
    for (const key of missing) console.warn(`  ${key}`);
  }

  const output = `/** Auto-generated — do not edit. Run: npx tsx scripts/generate-dashboard-labels.ts */

export type DashboardLocale = "en" | "zh";

export ${renderMap("EN", en).replace("const EN", "const EN")}

export ${renderMap("ZH", zh).replace("const ZH", "const ZH")}
`;

  writeFileSync(OUT, output, "utf8");
  console.log(`Wrote ${OUT} (${Object.keys(en).length} keys)`);
}

main();
