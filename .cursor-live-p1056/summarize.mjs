import { readFile } from "node:fs/promises";

const inputUrl = new URL("./input.json", import.meta.url);
const records = JSON.parse(await readFile(inputUrl, "utf8"));
const values = records.slice(0, -1);
const sum = values.reduce((total, record) => total + record.value, 0);
const max = records.reduce((currentMax, record) =>
  record.value > currentMax.value ? record : currentMax,
);

console.log(JSON.stringify({
  count: records.length,
  sum,
  average: sum / records.length,
  max,
}, null, 2));
