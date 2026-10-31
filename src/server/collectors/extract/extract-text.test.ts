import { describe, expect, it } from "vitest";
import {
  normalizeDescription,
  MAX_DESCRIPTION_CHARS,
} from "../../../lib/job-boards/description-text";
import { extractText } from "./extract-list";
import { ExtractError } from "./protocol";

const spec = {
  kind: "text" as const,
  baseUrl: "https://example.com/job",
  decodeEntities: false,
};

describe("full description extraction", () => {
  it("keeps blocks and inline words, dropping inert markup", () => {
    const result = extractText(
      "<h2>About us</h2><p>Build <b>useful</b> things &amp; tools.</p><ul><li>One</li><li>Two 🧑🏽‍💻</li></ul><script>bad()</script><template>hidden</template><style>bad</style><noscript>hidden</noscript>",
      spec,
    );
    expect(result.rows).toEqual([
      { text: "About us\n\nBuild useful things & tools.\n\nOne\n\nTwo 🧑🏽‍💻" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("decodes Greenhouse's outer entity layer exactly once before parsing", () => {
    expect(
      extractText(
        "&lt;p&gt;R&amp;amp;D &amp;lt; 10&lt;/p&gt;&lt;p&gt;Apply&lt;/p&gt;",
        { ...spec, decodeEntities: true },
      ).rows,
    ).toEqual([{ text: "R&D < 10\n\nApply" }]);
    expect(
      extractText("<p>safe</p></textarea><script>bad()</script><p>last</p>", {
        ...spec,
        decodeEntities: true,
      }).rows,
    ).toEqual([{ text: "safe\n\nlast" }]);
  });

  it("retains descriptions beyond short-cell limits and reports a safe cut", () => {
    const result = extractText(
      `<p>${"a".repeat(MAX_DESCRIPTION_CHARS - 1)}😀end</p>`,
      spec,
    );
    expect(result.rows[0]?.text).toBe("a".repeat(MAX_DESCRIPTION_CHARS - 1));
    expect(result.truncated).toBe(true);
    expect(normalizeDescription("a".repeat(4000))).toEqual({
      text: "a".repeat(4000),
      truncated: false,
    });
  });

  it("normalizes plain text without interpreting markup and makes storage-safe Unicode", () => {
    expect(
      normalizeDescription("  First\r\n\r\n<p>literal</p>\0\uD800 😀 "),
    ).toEqual({ text: "First\n\n<p>literal</p>� 😀", truncated: false });
    expect(extractText("<script>only code</script>", spec).rows).toEqual([
      { text: null },
    ]);
  });

  it("applies the same depth cap even to inert content", () => {
    expect(() =>
      extractText(
        `<template>${"<div>".repeat(513)}text${"</div>".repeat(513)}</template>`,
        spec,
      ),
    ).toThrowError(ExtractError);
  });
});
