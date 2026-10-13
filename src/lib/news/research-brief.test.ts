import { expect, it } from "vitest";
import { storylineResearchBrief, storylineTopicKey } from "./research-brief";
it("makes a bounded canonical key from a human topic", () => {
  expect(storylineTopicKey("  Open Modèles & work! ")).toBe(
    "open-modeles-work",
  );
  expect(storylineTopicKey("a".repeat(120))).toHaveLength(100);
  expect(storylineTopicKey("!!!")).toBe("");
});
it("directs the user's runtime to check coverage, reserve, and submit a review-only draft", () => {
  const brief = storylineResearchBrief("Atlas", "Open models", "open-models");
  for (const name of [
    "browse-news-storylines",
    "browse-news-research",
    "reserve-news-storyline",
    "propose-news-storyline",
    "release-news-storyline",
  ])
    expect(brief).toContain(name);
  expect(brief).toContain("does not publish");
  expect(brief).toContain("own runtime");
  expect(brief).toContain("slug “open-models”");
});
