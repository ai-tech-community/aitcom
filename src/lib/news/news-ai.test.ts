import { describe, expect, it } from "vitest";

import { classifyNewsAi, groupNewsAiUpdates, newsTextForAi } from "./news-ai";

describe("classifyNewsAi", () => {
  it("tags an explicit AI headline and leaves a vague one untagged", () => {
    expect(classifyNewsAi("OpenAI ships a new model", "A lab note.")).toBe(
      true,
    );
    expect(
      classifyNewsAi("EU AI Act enforcement begins", "Brussels published it."),
    ).toBe(true);
    expect(classifyNewsAi("The next chapter", "More soon.")).toBeNull();
    expect(classifyNewsAi("   ", "")).toBeNull();
  });

  it("tags a clear technology or business subject as not AI", () => {
    expect(
      classifyNewsAi(
        "Banks say the budget will tax their profits",
        "Mortgage rates also rose.",
      ),
    ).toBe(false);
    expect(classifyNewsAi("GTA 6 is a video game", "Rockstar.")).toBe(false);
    expect(
      classifyNewsAi("Online ads deliver spyware", "Researchers say so."),
    ).toBe(false);
  });

  it("does not let a business word override an AI signal", () => {
    expect(
      classifyNewsAi(
        "Treasuries rally as investors seek shelter from AI turbulence",
        "Shares fell.",
      ),
    ).toBe(true);
  });

  it("ignores the word ai inside a host and a generated summary is not an input", () => {
    expect(newsTextForAi("Read more at example.ai today", "")).not.toMatch(
      /\bai\b/i,
    );
    expect(classifyNewsAi("Read the note", "See https://example.ai/post")).toBe(
      null,
    );
  });

  it("keeps ambiguous rows out of both update lists", () => {
    const groups = groupNewsAiUpdates([
      { id: "ai", title: "Anthropic publishes a model card", summary: "" },
      { id: "biz", title: "The bank raises its dividend", summary: "" },
      { id: "unclear", title: "What the bell sounded like", summary: "" },
    ]);
    expect(groups).toEqual({
      ai: ["ai"],
      notAi: ["biz"],
      ambiguous: ["unclear"],
    });
  });
});
