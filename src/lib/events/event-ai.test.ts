import { describe, expect, it } from "vitest";

import {
  classifyEventAi,
  eventAiRobots,
  eventListingEmitsJsonLd,
  eventTextForAi,
  groupEventAiUpdates,
  parseEventAiQuery,
} from "./event-ai";

describe("classifyEventAi", () => {
  it("reads AI from the title or description", () => {
    expect(classifyEventAi("Sunday pottery wheel", "Clay and glaze.")).toBe(
      false,
    );
    expect(
      classifyEventAi("Builders night", "A practical meetup on shipping AI."),
    ).toBe(true);
    expect(classifyEventAi("Workshop", "Nothing special.", "AI salon")).toBe(
      true,
    );
  });

  it("does not treat a host name or the letters inside another word as AI", () => {
    expect(
      classifyEventAi(
        "Neighbourhood market",
        "See details at https://example.ai/market and email hi@example.ai",
      ),
    ).toBe(false);
    expect(classifyEventAi("Explain the budget", "A fair for painters.")).toBe(
      false,
    );
    expect(classifyEventAi("A.I. office hours", "")).toBe(true);
  });

  it("classifies Dutch wording", () => {
    expect(
      classifyEventAi("Avond", "Een lezing over kunstmatige intelligentie."),
    ).toBe(true);
  });

  it("reads empty text as not AI and does not invent a source", () => {
    expect(classifyEventAi("   ", null)).toBe(false);
    expect(eventTextForAi("Pottery", null)).not.toMatch(/https?:/);
  });
});

describe("groupEventAiUpdates", () => {
  it("puts every row on one side", () => {
    const groups = groupEventAiUpdates([
      { id: 1, title: "Pottery", description: "Clay." },
      { id: 2, title: "LLM day", description: "Models." },
    ]);
    expect(groups).toEqual({ ai: [2], notAi: [1] });
  });
});

describe("event listing AI query", () => {
  it("accepts only ?ai=1 and ?ai=0", () => {
    expect(parseEventAiQuery("1")).toBe("yes");
    expect(parseEventAiQuery("0")).toBe("no");
    expect(parseEventAiQuery("yes")).toBeNull();
    expect(parseEventAiQuery(undefined)).toBeNull();
  });

  it("noindexes a filtered view and keeps Event JSON-LD on the unfiltered page", () => {
    expect(eventAiRobots(null)).toEqual({ index: true, follow: true });
    expect(eventAiRobots("yes")).toEqual({ index: false, follow: true });
    expect(eventAiRobots("no")).toEqual({ index: false, follow: true });
    expect(eventListingEmitsJsonLd(null)).toBe(true);
    expect(eventListingEmitsJsonLd("yes")).toBe(false);
    expect(eventListingEmitsJsonLd("no")).toBe(false);
  });
});
