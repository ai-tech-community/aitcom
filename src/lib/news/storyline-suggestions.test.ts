import { expect, it } from "vitest";
import { validateStorylineProposals } from "./storyline-suggestions";
import { storyFixture } from "@/test/news-storyline-fixture";

const candidates = storyFixture.articles.map((m) => m.article);
const proposal = () => ({
  slug: "local-ai",
  titleEn: "AI on devices",
  overviewEn: "A shift to local processing.",
  questionsEn: [],
  articles: storyFixture.articles
    .slice(0, 2)
    .map(({ articleId, noteEn, evidence }) => ({
      articleId,
      noteEn,
      evidence,
    })),
});

it("forces unsaved draft state and strips model-provided identity or publication", () => {
  const result = validateStorylineProposals(
    {
      proposals: [
        {
          ...proposal(),
          id: "overwrite",
          status: "published",
          revision: 100,
          connections: [{ targetId: "invented" }],
        },
      ],
    },
    candidates,
  );
  expect(result.drafts[0]?.input).toMatchObject({
    status: "draft",
    revision: 0,
    connections: [],
  });
  expect(result.drafts[0]?.input.id).toBeUndefined();
  expect(result.drafts[0]?.articles).toHaveLength(2);
});
it("rejects unknown references, duplicate membership, and evidence outside the source", () => {
  for (const articles of [
    [
      { ...proposal().articles[0]!, articleId: "invented" },
      proposal().articles[1]!,
    ],
    [proposal().articles[0]!, proposal().articles[0]!],
    proposal().articles.map((a) => ({
      ...a,
      evidence: "A generated but unsupported conclusion.",
    })),
  ])
    expect(
      validateStorylineProposals(
        { proposals: [{ ...proposal(), articles }] },
        candidates,
      ).drafts,
    ).toEqual([]);
});
it("keeps valid proposals while discarding malformed or duplicate proposals", () => {
  const result = validateStorylineProposals(
    { proposals: [null, proposal(), { ...proposal(), slug: "other" }] },
    candidates,
  );
  expect(result.drafts).toHaveLength(1);
  expect(result.discarded).toBe(2);
});
it("avoids occupied URLs and treats no suggested grouping as a valid empty result", () => {
  expect(
    validateStorylineProposals(
      { proposals: [proposal()] },
      candidates,
      new Set(["local-ai"]),
    ).discarded,
  ).toBe(1);
  expect(validateStorylineProposals({ proposals: [] }, candidates)).toEqual({
    drafts: [],
    discarded: 0,
  });
  expect(
    validateStorylineProposals({ proposals: "bad" }, candidates).discarded,
  ).toBe(1);
});
