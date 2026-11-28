// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const checker = new URL("../../scripts/check-i18n-parity.mjs", import.meta.url);
const valid = String.raw`{"redesign":{"groups":[{"label":"Escaped quote \" and } ]"},{"label":"Other"}]}}`;

function runChecker(locale?: string, source = valid) {
  const directory = mkdtempSync(join(tmpdir(), "i18n-parity-"));
  try {
    const script = join(directory, "scripts", "check-i18n-parity.mjs");
    mkdirSync(join(directory, "scripts"));
    mkdirSync(join(directory, "messages"));
    copyFileSync(checker, script);
    for (const file of ["en.json", "fr.json"]) {
      writeFileSync(
        join(directory, "messages", file),
        file === locale ? source : valid,
      );
    }
    return spawnSync(process.execPath, [script], { encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("check-i18n-parity", () => {
  it("allows matching catalogues with repeated keys in separate objects", () => {
    const result = runChecker();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("keys in fr.json");
  });

  it.each([
    [
      "en.json",
      '{"redesign":{"builder":"Setup"},"redesign":{"groups":[]}}',
      "$.redesign",
    ],
    [
      "fr.json",
      String.raw`{"redesign":{"groups":[{},{"label":"First","\u006cabel":"Other"}]}}`,
      "$.redesign.groups[1].label",
    ],
  ])("rejects a duplicate key in %s", (file, source, path) => {
    const result = runChecker(file, source);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(`Duplicate key in ${file} at ${path}`);
  });
});
