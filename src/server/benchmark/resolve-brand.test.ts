import { describe, expect, it } from "vitest";
import { resolveBrand } from "./resolve-brand";

const brands = [
  {
    id: "b1",
    slug: "openai",
    canonicalName: "OpenAI",
    aliases: ["chatgpt", "gpt-4", "gpt"],
  },
  {
    id: "b2",
    slug: "anthropic",
    canonicalName: "Anthropic",
    aliases: ["claude", "claude-3"],
  },
];

describe("resolveBrand", () => {
  it("matches by canonical name case-insensitively", () => {
    expect(resolveBrand("openai", brands)?.id).toBe("b1");
    expect(resolveBrand("OpenAI", brands)?.id).toBe("b1");
  });

  it("matches by alias case-insensitively", () => {
    expect(resolveBrand("ChatGPT", brands)?.id).toBe("b1");
    expect(resolveBrand("claude-3", brands)?.id).toBe("b2");
  });

  it("prefers suggested slug if provided", () => {
    expect(
      resolveBrand("some weird name", brands, { suggestedSlug: "anthropic" })
        ?.id,
    ).toBe("b2");
  });

  it("returns null for unknown brands", () => {
    expect(resolveBrand("NotABrand", brands)).toBeNull();
  });

  it("ignores suggestedSlug if it does not exist", () => {
    expect(resolveBrand("OpenAI", brands, { suggestedSlug: "ghost" })?.id).toBe(
      "b1",
    );
  });
});
