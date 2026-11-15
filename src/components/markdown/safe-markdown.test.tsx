import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafeMarkdown } from "./safe-markdown";

describe("SafeMarkdown direction", () => {
  const markdown = [
    "## כותרת",
    "",
    "שלום לכולם",
    "",
    "- ייעוץ",
    "",
    "1. ראשון",
    "",
    "> ציטוט",
    "",
    "```",
    "const a = 1;",
    "```",
    "",
    "| א | ב |",
    "| - | - |",
    "| 1 | 2 |",
  ].join("\n");

  it("lets every text block take its direction from its own words", () => {
    const { container } = render(<SafeMarkdown>{markdown}</SafeMarkdown>);
    for (const selector of ["h2", "p", "ul", "ol", "blockquote", "table"]) {
      expect(container.querySelector(selector)).toHaveAttribute("dir", "auto");
    }
  });

  it("keeps code left to right and uses starting-side indents", () => {
    const { container } = render(<SafeMarkdown>{markdown}</SafeMarkdown>);
    expect(container.querySelector("pre")).toHaveAttribute("dir", "ltr");
    expect(container.querySelector("ul")?.className).toContain("ps-6");
    expect(container.querySelector("blockquote")?.className).toContain(
      "border-s-4",
    );
  });
});
