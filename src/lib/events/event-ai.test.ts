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

  it("treats GPU, NVIDIA, automation, agents, and data science as AI", () => {
    expect(
      classifyEventAi("NVIDIA GTC Berlin 2026", "Keynote at Tempodrom."),
    ).toBe(true);
    expect(classifyEventAi("GPU workshop", "Bring a laptop.")).toBe(true);
    expect(
      classifyEventAi(
        "How I Automated My Company",
        "A live hour inside the bots that run my day.",
      ),
    ).toBe(true);
    expect(
      classifyEventAi("Boston OpenClaw meetup", "Personal-agent meetup."),
    ).toBe(true);
    expect(classifyEventAi("Data science breakfast", "Bring a notebook.")).toBe(
      true,
    );
    expect(classifyEventAi("Grok Bot Training", "Weekly live session.")).toBe(
      true,
    );
    expect(
      classifyEventAi(
        "MCP Dev Summit",
        "A summit on the Model Context Protocol and the agent ecosystem.",
      ),
    ).toBe(true);
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

  it("leaves an ambiguous title null", () => {
    expect(classifyEventAi("   ", null)).toBeNull();
    expect(
      classifyEventAi(
        "Web Summit 2026",
        "Web Summit at MEO Arena in Lisbon, 9–12 Nov 2026.",
      ),
    ).toBeNull();
    expect(classifyEventAi("test", "tes")).toBeNull();
    expect(classifyEventAi("Community gathering", "See you there.")).toBeNull();
  });

  it("classifies Dutch wording", () => {
    expect(
      classifyEventAi("Avond", "Een lezing over kunstmatige intelligentie."),
    ).toBe(true);
    expect(
      classifyEventAi("Werkavond", "Een sessie over automatisering."),
    ).toBe(true);
  });

  it("does not invent a source", () => {
    expect(eventTextForAi("Pottery", null)).not.toMatch(/https?:/);
  });
});

describe("groupEventAiUpdates", () => {
  it("keeps an ambiguous row out of both sides", () => {
    const groups = groupEventAiUpdates([
      { id: 1, title: "Pottery", description: "Clay." },
      { id: 2, title: "LLM day", description: "Models." },
      { id: 3, title: "Web Summit 2026", description: "Lisbon." },
    ]);
    expect(groups).toEqual({ ai: [2], notAi: [1], ambiguous: [3] });
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
