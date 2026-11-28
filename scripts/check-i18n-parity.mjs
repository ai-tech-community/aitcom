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

function assertUniqueKeys(source, file) {
  // JSON.parse has already checked the syntax. Scan strings and structural
  // tokens in the original text, where repeated properties are still visible.
  const containers = [];
  for (const [token, string, colon] of source.matchAll(
    /("(?:[^"\\]|\\.)*")\s*(:)?|[{}[\],]/g,
  )) {
    const parent = containers.at(-1);
    if (token === "{" || token === "[") {
      let segment = "$";
      if (parent) segment = parent.keys ? parent.member : `[${parent.index}]`;
      containers.push({
        segment,
        keys: token === "{" ? new Set() : null,
        member: "",
        index: 0,
      });
    } else if (token === "}" || token === "]") {
      containers.pop();
    } else if (token === "," && !parent.keys) {
      parent.index++;
    } else if (colon) {
      const key = JSON.parse(string);
      parent.member = /^[A-Za-z_$][\w$]*$/.test(key)
        ? `.${key}`
        : `[${JSON.stringify(key)}]`;
      if (parent.keys.has(key)) {
        const path = containers.map(({ segment }) => segment).join("");
        throw new Error(`Duplicate key in ${file} at ${path}${parent.member}`);
      }
      parent.keys.add(key);
    }
  }
}

const directory = new URL("../messages/", import.meta.url);
function read(file) {
  const source = readFileSync(new URL(file, directory), "utf8");
  const messages = JSON.parse(source);
  assertUniqueKeys(source, file);
  return new Set(paths(messages));
}

function checkParity() {
  const english = read("en.json");
  for (const file of readdirSync(directory).filter((file) =>
    file.endsWith(".json"),
  )) {
    const keys = file === "en.json" ? english : read(file);
    const missing = [...english].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !english.has(key));
    if (missing.length || extra.length) {
      process.exitCode = 1;
      if (missing.length)
        console.error(`Missing in ${file}:\n  ${missing.join("\n  ")}`);
      if (extra.length)
        console.error(`Extra in ${file}:\n  ${extra.join("\n  ")}`);
    } else {
      console.log(`i18n parity OK — ${english.size} keys in ${file}.`);
    }
  }
}

try {
  checkParity();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
