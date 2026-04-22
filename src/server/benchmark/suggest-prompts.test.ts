import { describe, expect, it } from "vitest";
import { parseSuggestionResponse } from "./suggest-prompts";

const cats = new Set(["saas", "finance"]);
const intents = new Set(["recommendation", "comparison"]);

describe("parseSuggestionResponse", () => {
  it("parses a valid response", () => {
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          {
            text: "What is the best CRM for startups?",
            categorySlug: "saas",
            intentSlug: "recommendation",
            tags: ["B2B", "crm"],
          },
        ],
      }),
      cats,
      intents,
    );
    expect(result).toEqual([
      {
        text: "What is the best CRM for startups?",
        categorySlug: "saas",
        intentSlug: "recommendation",
        tags: ["b2b", "crm"],
      },
    ]);
  });

  it("rejects suggestions with unknown category/intent slugs", () => {
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          { text: "Test", categorySlug: "nope", intentSlug: "recommendation" },
          { text: "Test", categorySlug: "saas", intentSlug: "fake" },
        ],
      }),
      cats,
      intents,
    );
    expect(result).toEqual([]);
  });

  it("rejects prompts shorter than 4 chars", () => {
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          { text: "hi", categorySlug: "saas", intentSlug: "recommendation" },
        ],
      }),
      cats,
      intents,
    );
    expect(result).toEqual([]);
  });

  it("clamps text to 500 chars and tags to 10 entries", () => {
    const long = "x".repeat(1000);
    const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const result = parseSuggestionResponse(
      JSON.stringify({
        suggestions: [
          {
            text: long,
            categorySlug: "saas",
            intentSlug: "recommendation",
            tags: manyTags,
          },
        ],
      }),
      cats,
      intents,
    );
    expect(result[0]?.text.length).toBe(500);
    expect(result[0]?.tags.length).toBe(10);
  });

  it("returns [] on malformed JSON", () => {
    expect(parseSuggestionResponse("not json", cats, intents)).toEqual([]);
  });

  it("returns [] when suggestions field is missing", () => {
    expect(parseSuggestionResponse("{}", cats, intents)).toEqual([]);
  });
});
