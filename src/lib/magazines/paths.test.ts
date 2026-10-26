import { describe, expect, it } from "vitest";

import {
  communityMagazinePath,
  issueBuilderPath,
  issuePath,
  magazineArticlePath,
  magazinePath,
} from "./paths";

const magazine = { slug: "agents-weekly" };
const issue = { slug: "the-tools-issue-3" };
const article = { slug: "why-evals-matter" };

describe("magazine paths", () => {
  it("magazinePath is the public shelf", () => {
    expect(magazinePath(magazine)).toBe("/magazines/agents-weekly");
  });

  it("issuePath is the issue reading page under its magazine", () => {
    expect(issuePath(magazine, issue)).toBe(
      "/magazines/agents-weekly/the-tools-issue-3",
    );
  });

  it("magazineArticlePath is the long-read under its issue", () => {
    expect(magazineArticlePath(magazine, issue, article)).toBe(
      "/magazines/agents-weekly/the-tools-issue-3/why-evals-matter",
    );
  });

  it("communityMagazinePath is the community's Magazine tab", () => {
    expect(communityMagazinePath("builders")).toBe(
      "/communities/builders/magazine",
    );
  });

  it("issueBuilderPath is the issue builder in the community", () => {
    expect(issueBuilderPath("builders", 42)).toBe(
      "/communities/builders/magazine/issues/42/edit",
    );
  });
});
