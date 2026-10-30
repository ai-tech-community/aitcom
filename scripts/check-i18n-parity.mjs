// Check every locale catalogue against the English key structure.
import { readFileSync, readdirSync } from "node:fs";

function paths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value)
      ? paths(value, path)
      : [path];
  });
}

const directory = new URL("../messages/", import.meta.url);
const read = (file) =>
  JSON.parse(readFileSync(new URL(file, directory), "utf8"));
const english = new Set(paths(read("en.json")));
let failed = false;
for (const file of readdirSync(directory).filter((file) =>
  file.endsWith(".json"),
)) {
  const keys = new Set(paths(read(file)));
  const missing = [...english].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !english.has(key));
  if (missing.length || extra.length) {
    failed = true;
    if (missing.length)
      console.error(`Missing in ${file}:\n  ${missing.join("\n  ")}`);
    if (extra.length)
      console.error(`Extra in ${file}:\n  ${extra.join("\n  ")}`);
  } else {
    console.log(`i18n parity OK — ${english.size} keys in ${file}.`);
  }
}
if (failed) process.exitCode = 1;
