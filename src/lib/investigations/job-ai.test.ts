import { describe, expect, it } from "vitest";

import {
  classifyJobAi,
  countStartupRolesByAi,
  groupRoleAiUpdates,
} from "./job-ai";

describe("classifyJobAi", () => {
  it("reads AI work from the title or the description", () => {
    expect(classifyJobAi("Machine Learning Engineer", null)).toBe(true);
    expect(classifyJobAi("Accountant", "Train large language models.")).toBe(
      true,
    );
    expect(classifyJobAi("Prompt Engineer", "Write prompts.")).toBe(true);
    expect(
      classifyJobAi("Researcher", "Kunstmatige intelligentie voor zorg."),
    ).toBe(true);
    expect(classifyJobAi("AI-powered Support", null)).toBe(true);
  });

  it("keeps a non-AI posting, including words that only look like AI", () => {
    expect(classifyJobAi("Accountant", "Close the monthly books.")).toBe(false);
    expect(
      classifyJobAi("Clinical Data Lead", "Source clinical datasets."),
    ).toBe(false);
    expect(
      classifyJobAi("Email Marketing Manager", "Send the newsletter."),
    ).toBe(false);
    expect(classifyJobAi("Office Manager", "Available immediately.")).toBe(
      false,
    );
    expect(
      classifyJobAi("Trainer", "Run the onboarding training program."),
    ).toBe(false);
    expect(
      classifyJobAi("Analyst", "Own business intelligence dashboards."),
    ).toBe(false);
    expect(classifyJobAi("Support Agent", "Help customers by email.")).toBe(
      false,
    );
    expect(
      classifyJobAi(
        "Office Manager",
        "Apply at https://example.ai/jobs or jobs@example.ai.",
      ),
    ).toBe(false);
  });
});

describe("groupRoleAiUpdates", () => {
  it("classifies a batch and does not drop the non-AI role", () => {
    expect(
      groupRoleAiUpdates([
        {
          id: "acct",
          title: "Accountant",
          descriptionText: "Close the monthly books.",
        },
        {
          id: "ml",
          title: "Machine Learning Engineer",
          descriptionText: null,
        },
      ]),
    ).toEqual({ ai: ["ml"], notAi: ["acct"] });
  });
});

describe("countStartupRolesByAi", () => {
  it("counts stored flags and leaves unclassified rows out of both sides", () => {
    expect(
      countStartupRolesByAi([
        { isAi: true },
        { isAi: true },
        { isAi: false },
        { isAi: null },
        {},
      ]),
    ).toEqual({ ai: 2, notAi: 1, unclassified: 2 });
  });
});
