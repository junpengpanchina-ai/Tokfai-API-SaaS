import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(__dirname, "input.json"), "utf8"));

const count = items.length;
const sum = items.reduce((acc, item) => acc + item.value, 0);
const average = sum / count;
const max = items.reduce((best, item) =>
  item.value > best.value ? item : best
);

const result = {
  count,
  sum,
  average,
  max: {
    name: max.name,
    value: max.value,
  },
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
