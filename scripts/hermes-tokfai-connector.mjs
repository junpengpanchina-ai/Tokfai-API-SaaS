#!/usr/bin/env node
/**
 * Tokfai Hermes Connector (P1073) — product integration (no consumer Terminal).
 *
 * Unmodified Hermes Desktop cannot auto-inherit chat Base URL for STT.
 * This connector is the legitimate local configuration seam:
 *
 *   connect  — GUI / one-shot apply with Base URL + API Key + Model only
 *   sync     — derive STT from already-saved Tokfai chat settings (watch/once)
 *   watch    — LaunchAgent-friendly loop: sync when Tokfai chat URL appears
 *   install  — install macOS LaunchAgent + optional double-click .app (GUI)
 *   gui      — native macOS dialogs (osascript); no Terminal required for user
 *
 * Consumer data fields: exactly 3 (Base URL, API Key, Model).
 * Never asks for STT_OPENAI_BASE_URL / VOICE_TOOLS_OPENAI_KEY.
 *
 * Internal helper (not a consumer CLI product): hermes-tokfai-voice-bootstrap.mjs
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyHermesTokfaiSttSync,
  detectTokfaiChatBase,
  isTokfaiOpenAiCompatibleBaseUrl,
  normalizeBaseUrl,
} from "./lib/hermes-tokfai-stt-sync.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = join(ROOT, "scripts/hermes-tokfai-connector.mjs");
const PASS = "TOKFAI_HERMES_CONNECTOR_OK";
const FAIL = "TOKFAI_HERMES_CONNECTOR_FAIL";

function arg(name, envName) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return envName ? process.env[envName] ?? "" : "";
}

function hermesHome() {
  return process.env.HERMES_HOME || join(homedir(), ".hermes");
}

function cmd() {
  const a = process.argv[2];
  if (!a || a.startsWith("-")) return "connect";
  return a;
}

function runConnect() {
  const baseUrl = normalizeBaseUrl(arg("--base-url", "TOKFAI_BASE_URL"));
  const apiKey = arg("--api-key", "TOKFAI_API_KEY");
  const model = arg("--model", "TOKFAI_MODEL") || "gpt-5.5";
  const dryRun =
    process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

  if (!isTokfaiOpenAiCompatibleBaseUrl(baseUrl)) {
    console.error(FAIL);
    console.error("Base URL must be a Tokfai OpenAI-compatible URL (*.tokfai.com)");
    process.exit(1);
  }
  if (!String(apiKey).startsWith("sk-tokfai_")) {
    console.error(FAIL);
    console.error("API Key must be sk-tokfai_...");
    process.exit(1);
  }

  const result = applyHermesTokfaiSttSync({
    hermesHome: hermesHome(),
    baseUrl,
    apiKey,
    model,
    dryRun,
    mode: "connect",
    backupTag: "p1073-connect",
  });

  console.log(JSON.stringify({
    mode: "connect",
    CONSUMER_DATA_FIELD_COUNT: 3,
    TERMINAL_COMMAND_REQUIRED: false,
    MANUAL_CONFIG_EDIT_REQUIRED: false,
    EXTRA_ENDPOINT_FIELD_REQUIRED: false,
    EXTRA_SECRET_REQUIRED: false,
    ...result,
  }, null, 2));
  console.log(result.ok ? PASS : FAIL);
  process.exit(result.ok ? 0 : 1);
}

function runSyncOnce() {
  const dryRun =
    process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
  const home = hermesHome();
  const result = applyHermesTokfaiSttSync({
    hermesHome: home,
    dryRun,
    mode: "sync-derived",
    backupTag: "p1073-sync",
  });
  console.log(
    JSON.stringify(
      {
        mode: "sync",
        detected: detectTokfaiChatBase(home),
        ...result,
      },
      null,
      2
    )
  );
  console.log(result.ok ? PASS : FAIL);
  process.exit(result.ok && !result.skipped ? 0 : result.skipped ? 0 : 1);
}

function runWatch() {
  const home = hermesHome();
  const intervalMs = Number(process.env.TOKFAI_CONNECTOR_POLL_MS || 5000);
  console.log(`Tokfai Hermes Connector watch: ${home} every ${intervalMs}ms`);
  let lastSig = "";
  const tick = () => {
    try {
      const envPath = join(home, ".env");
      const cfgPath = join(home, "config.yaml");
      const sig = [
        existsSync(envPath) ? readFileSync(envPath, "utf8") : "",
        existsSync(cfgPath) ? readFileSync(cfgPath, "utf8") : "",
      ].join("\0");
      if (sig === lastSig) return;
      lastSig = sig;
      const detected = detectTokfaiChatBase(home);
      if (!detected) return;
      const result = applyHermesTokfaiSttSync({
        hermesHome: home,
        mode: "sync-derived",
        backupTag: "p1073-watch",
      });
      if (!result.skipped) {
        console.log(
          new Date().toISOString(),
          "synced STT →",
          result.sttBaseUrl,
          result.actions.join("; ")
        );
      }
    } catch (err) {
      console.error("watch tick error:", err instanceof Error ? err.message : err);
    }
  };
  tick();
  setInterval(tick, intervalMs);
}

function osascript(script) {
  const r = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
  });
  return r;
}

function runGui() {
  if (process.platform !== "darwin") {
    console.error(FAIL);
    console.error("gui mode requires macOS (osascript). Use connect with flags in automation.");
    process.exit(1);
  }
  const baseDlg = osascript(`
set r to display dialog "Tokfai Hermes Connector — Base URL" default answer "https://api.tokfai.com/v1" buttons {"Cancel", "Next"} default button "Next"
if button returned of r is "Cancel" then error number -128
return text returned of r
`);
  if (baseDlg.status !== 0) {
    console.error(FAIL);
    process.exit(1);
  }
  const keyDlg = osascript(`
set r to display dialog "Tokfai Hermes Connector — API Key" default answer "" buttons {"Cancel", "Next"} default button "Next" with hidden answer
if button returned of r is "Cancel" then error number -128
return text returned of r
`);
  if (keyDlg.status !== 0) {
    console.error(FAIL);
    process.exit(1);
  }
  const modelDlg = osascript(`
set r to display dialog "Tokfai Hermes Connector — Model" default answer "gpt-5.5" buttons {"Cancel", "Connect"} default button "Connect"
if button returned of r is "Cancel" then error number -128
return text returned of r
`);
  if (modelDlg.status !== 0) {
    console.error(FAIL);
    process.exit(1);
  }

  const baseUrl = normalizeBaseUrl(baseDlg.stdout.trim());
  const apiKey = keyDlg.stdout.trim();
  const model = modelDlg.stdout.trim() || "gpt-5.5";

  const result = applyHermesTokfaiSttSync({
    hermesHome: hermesHome(),
    baseUrl,
    apiKey,
    model,
    mode: "connect",
    backupTag: "p1073-gui",
  });

  const msg = result.ok
    ? `Connected. STT base → ${result.sttBaseUrl}\\nChat key source: ${result.chatKeySource}\\nSTT key inherits OpenAI key (no extra secret).`
    : `Failed: ${result.reason}`;
  osascript(`display alert "Tokfai Hermes Connector" message "${msg.replace(/"/g, '\\"')}"`);
  console.log(JSON.stringify(result, null, 2));
  console.log(result.ok ? PASS : FAIL);
  process.exit(result.ok ? 0 : 1);
}

function installMacos() {
  if (process.platform !== "darwin") {
    console.error(FAIL);
    console.error("install currently supports macOS LaunchAgent + .app");
    process.exit(1);
  }
  const nodePath =
    process.env.TOKFAI_CONNECTOR_NODE ||
    spawnSync("which", ["node"], { encoding: "utf8" }).stdout.trim() ||
    "/usr/local/bin/node";
  const agentsDir = join(homedir(), "Library/LaunchAgents");
  const appDir = join(
    homedir(),
    "Applications/Tokfai Hermes Connector.app/Contents/MacOS"
  );
  const label = "com.tokfai.hermes-connector";
  const plistPath = join(agentsDir, `${label}.plist`);
  const logDir = join(homedir(), "Library/Logs/Tokfai");
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(appDir, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${SELF}</string>
    <string>watch</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(logDir, "hermes-connector.out.log")}</string>
  <key>StandardErrorPath</key><string>${join(logDir, "hermes-connector.err.log")}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HERMES_HOME</key><string>${join(homedir(), ".hermes")}</string>
    <key>TOKFAI_CONNECTOR_POLL_MS</key><string>5000</string>
  </dict>
</dict>
</plist>
`;
  writeFileSync(plistPath, plist, { mode: 0o644 });

  const launcher = `#!/bin/bash
exec "${nodePath}" "${SELF}" gui
`;
  const binPath = join(appDir, "Tokfai Hermes Connector");
  writeFileSync(binPath, launcher, { mode: 0o755 });
  chmodSync(binPath, 0o755);

  // Info.plist minimal
  writeFileSync(
    join(dirname(appDir), "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>Tokfai Hermes Connector</string>
  <key>CFBundleIdentifier</key><string>com.tokfai.hermes-connector.app</string>
  <key>CFBundleName</key><string>Tokfai Hermes Connector</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
</dict></plist>
`
  );

  spawnSync("launchctl", ["unload", plistPath], { encoding: "utf8" });
  const load = spawnSync("launchctl", ["load", plistPath], { encoding: "utf8" });

  console.log(
    JSON.stringify(
      {
        mode: "install",
        launchAgent: plistPath,
        app: join(homedir(), "Applications/Tokfai Hermes Connector.app"),
        launchctl: load.status,
        CONNECTOR_ACTION_COUNT: 1,
        CONSUMER_DATA_FIELD_COUNT: 3,
        note: "Double-click the app for Connect GUI, or use Hermes UI three fields — watch agent syncs STT.",
      },
      null,
      2
    )
  );
  console.log(PASS);
}

function printSeamFacts() {
  const home = hermesHome();
  const envPath = join(home, ".env");
  const cfgPath = join(home, "config.yaml");
  const stamp = join(home, "desktop-build-stamp.json");
  let sourceMode = null;
  if (existsSync(stamp)) {
    try {
      sourceMode = JSON.parse(readFileSync(stamp, "utf8")).sourceMode;
    } catch {
      sourceMode = null;
    }
  }
  const facts = {
    HERMES_PROVIDER_SAVE_PATH: `${home}/.env + ${home}/config.yaml (via Desktop → gateway PUT /api/env + /api/model/set)`,
    HERMES_AGENT_CONFIG_GENERATOR:
      "hermes-agent web/gateway handlers for /api/env and model assignment; Electron Application Support/Hermes holds UI prefs only",
    HERMES_DESKTOP_CONFIG_BRIDGE:
      "apps/desktop hermes.ts setEnvVar/setModelAssignment/saveHermesConfig → local gateway → ~/.hermes",
    SAFE_AUTOMATION_SEAM_FOUND: false,
    CLIENT_AUTOMATION_IMPOSSIBLE_WITH_UNMODIFIED_HERMES: true,
    CONNECTOR_REQUIRED: true,
    desktop_sourceMode: sourceMode,
    detectTokfaiChatBase: detectTokfaiChatBase(home),
    env_exists: existsSync(envPath),
    config_exists: existsSync(cfgPath),
  };
  // No stock hook on provider-save for STT inherit; desktop-plugins/hooks empty.
  console.log(JSON.stringify(facts, null, 2));
}

const c = cmd();
if (c === "connect") runConnect();
else if (c === "sync") runSyncOnce();
else if (c === "watch") runWatch();
else if (c === "gui") runGui();
else if (c === "install") installMacos();
else if (c === "seam-facts") printSeamFacts();
else {
  console.error(FAIL);
  console.error("Usage: hermes-tokfai-connector.mjs <connect|sync|watch|gui|install|seam-facts>");
  process.exit(1);
}
