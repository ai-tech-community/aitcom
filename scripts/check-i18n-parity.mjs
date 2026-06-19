// Verifies messages/en.json and messages/nl.json have identical key structure.
// Exits non-zero on any key present in one catalog but not the other.
import { readFileSync } from "node:fs";

function paths(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...paths(v, p));
    else out.push(p);
  }
  return out;
}

const en = new Set(paths(JSON.parse(readFileSync("messages/en.json", "utf8"))));
const nl = new Set(paths(JSON.parse(readFileSync("messages/nl.json", "utf8"))));

const missingNl = [...en].filter((p) => !nl.has(p));
const missingEn = [...nl].filter((p) => !en.has(p));

if (missingNl.length || missingEn.length) {
  if (missingNl.length) console.error(`Missing in nl.json (${missingNl.length}):\n  ${missingNl.join("\n  ")}`);
  if (missingEn.length) console.error(`Missing in en.json (${missingEn.length}):\n  ${missingEn.join("\n  ")}`);
  process.exit(1);
}
console.log(`i18n parity OK — ${en.size} keys in both catalogs.`);
