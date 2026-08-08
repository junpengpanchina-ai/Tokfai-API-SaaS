import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const summarizePath = join(__dirname, "summarize.mjs");

const proc = spawnSync(process.execPath, [summarizePath], {
  encoding: "utf8",
});

if (proc.status !== 0) {
  console.error("summarize.mjs failed:", proc.stderr || proc.stdout);
  process.exit(1);
}

const result = JSON.parse(proc.stdout);

const assert = (cond, msg) => {
  if (!cond) {
    console.error("ASSERT_FAIL:", msg, "got=", result);
    process.exit(1);
  }
};

assert(result.count === 4, "count === 4");
assert(result.sum === 54, "sum === 54");
assert(result.average === 13.5, "average === 13.5");
assert(result.max?.name === "gamma", 'max.name === "gamma"');
assert(result.max?.value === 31, "max.value === 31");

process.stdout.write("TOKFAI_P1054_VERIFY_PASS\n");
