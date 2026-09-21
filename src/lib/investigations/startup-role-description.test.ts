import { describe, expect, it } from "vitest";

import { parseStartupRoleDescription } from "./startup-role-description";

describe("parseStartupRoleDescription", () => {
  it("keeps an unstructured snapshot as a single paragraph", () => {
    expect(parseStartupRoleDescription("Build the product.")).toEqual([
      { type: "paragraph", text: "Build the product." },
    ]);
  });

  it("turns sourced headings and bullets into blocks without inventing copy", () => {
    expect(
      parseStartupRoleDescription(`About the role
Build the product.

Requirements:
- 5 years shipping TypeScript
- English

Nice to have:
- Dutch`),
    ).toEqual([
      { type: "heading", text: "About the role" },
      { type: "paragraph", text: "Build the product." },
      { type: "heading", text: "Requirements" },
      {
        type: "list",
        items: ["5 years shipping TypeScript", "English"],
      },
      { type: "heading", text: "Nice to have" },
      { type: "list", items: ["Dutch"] },
    ]);
  });

  it("reads Greenhouse-style • lists and short section titles", () => {
    const blocks = parseStartupRoleDescription(`About Anthropic
Anthropic's mission is to create reliable, interpretable, and steerable AI systems.

Key responsibilities
• Act as the primary technical advisor
• Partner closely with account executives

Minimum qualifications
• Experience as a Technical Product Manager`);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list",
      "heading",
      "list",
    ]);
    expect(blocks[0]).toEqual({ type: "heading", text: "About Anthropic" });
    expect(blocks[3]).toEqual({
      type: "list",
      items: [
        "Act as the primary technical advisor",
        "Partner closely with account executives",
      ],
    });
    expect(JSON.stringify(blocks)).not.toMatch(/salary|fit score/i);
  });

  it("returns nothing when the snapshot is blank", () => {
    expect(parseStartupRoleDescription("   ")).toEqual([]);
    expect(parseStartupRoleDescription(null)).toEqual([]);
  });
});
