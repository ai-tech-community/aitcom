// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const SOURCES = [
  "src/server/magazines",
  "src/lib/magazines",
  "src/components/magazines",
  "src/server/api/routers/magazines.ts",
  "src/server/api/routers/articles.ts",
  "src/app/[locale]/communities/[slug]/magazine",
];

function sourceFiles(path: string): string[] {
  if (statSync(path).isDirectory()) {
    return readdirSync(path).flatMap((entry) => sourceFiles(join(path, entry)));
  }
  if (
    !/\.tsx?$/.test(path) ||
    /\.test\.tsx?$/.test(path) ||
    ["roles.ts", "test-fixtures.ts"].includes(basename(path))
  ) {
    return [];
  }
  return [path];
}

it("only roles.ts names magazine roles", () => {
  const violations = SOURCES.flatMap((path) => sourceFiles(join(ROOT, path)))
    .filter((path) => {
      const source = readFileSync(path, "utf8");
      const namesMagazineRole = /(["'])(editor_in_chief|contributor)\1/.test(
        source,
      );
      const namesOwner =
        !["editorship.ts", "viewer-role.ts"].includes(basename(path)) &&
        /(["'])owner\1/.test(source);
      return namesMagazineRole || namesOwner;
    })
    .map((path) => relative(ROOT, path))
    .sort();

  expect(
    violations,
    `Use roles.ts capabilities or named constants in:\n${violations.join("\n")}`,
  ).toEqual([]);
});
