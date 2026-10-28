// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths";
import { describe, expect, it } from "vitest";

import { SHARE_IMAGE_FONT_FOLDER } from "./font-paths";

const picomatch = createRequire(import.meta.url)(
  "next/dist/compiled/picomatch",
) as (
  pattern: string,
  options: { dot: boolean; contains: boolean },
) => (path: string) => boolean;

describe("share image font tracing", () => {
  it.each([
    "app/[locale]/og/magazine/[magazineSlug]/[issueSlug]/route",
    "app/[locale]/og/magazine/[magazineSlug]/[issueSlug]/[articleSlug]/route",
  ])("ships the font folder with %s", async (entryName) => {
    const config = await readFile(
      join(process.cwd(), "next.config.js"),
      "utf8",
    );
    const tracing =
      /outputFileTracingIncludes:\s*\{([\s\S]*?)\n  \}/.exec(config)?.[1] ?? "";
    const entries = [
      ...tracing.matchAll(/("(?:[^"\\]|\\.)+"):\s*\[\s*"([^"]+)"/g),
    ].map(([, key, folder]) => ({
      pattern: JSON.parse(key!) as string,
      folder,
    }));
    // Require each route's own entry: Next's contains match also lets an
    // issue pattern cover its article route, masking a missing article entry.
    const route = normalizeAppPath(entryName);
    const pattern = route.replaceAll("[", "\\[").replaceAll("]", "\\]");
    const entry = entries.find((entry) => entry.pattern === pattern);

    expect(entry?.folder).toBe(`./${SHARE_IMAGE_FONT_FOLDER}/**/*`);
    expect(
      entry && picomatch(entry.pattern, { dot: true, contains: true })(route),
    ).toBe(true);
  });
});
