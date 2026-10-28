// @vitest-environment node
import { createRequire } from "node:module";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths";
import { describe, expect, it } from "vitest";

import config from "../../../next.config.js";
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
  ])("ships the font folder with %s", (entryName) => {
    // Require each route's own entry: Next's contains match also lets an
    // issue pattern cover its article route, masking a missing article entry.
    const route = normalizeAppPath(entryName);
    const pattern = route.replaceAll("[", "\\[").replaceAll("]", "\\]");
    const entry = config.outputFileTracingIncludes?.[pattern];
    expect(entry).toContain(`./${SHARE_IMAGE_FONT_FOLDER}/**/*`);
    expect(
      entry && picomatch(pattern, { dot: true, contains: true })(route),
    ).toBe(true);
  });
});
