import { describe, expect, it } from "vitest";
import {
  publicationIssues,
  storylineCopy,
  storylineInputSchema,
  storylineTimeline,
  validStorylineEvidence,
  type StorylineArticle,
} from "./storylines";

const articles: StorylineArticle[] = ["a", "b"].map((id) => ({
  id,
  title: `Article ${id}`,
  url: `https://example.org/${id}`,
  summary: "A smaller model runs on consumer hardware.",
  author: null,
  publishedAt: new Date("2026-10-13"),
}));
const input = () =>
  storylineInputSchema.parse({
    slug: "local-ai",
    titleEn: "Local AI",
    overviewEn: "The shift to devices",
    status: "published",
    articles: articles.map((a) => ({
      articleId: a.id,
      noteEn: "Explores local processing",
      evidence: "A smaller model runs on consumer hardware.",
    })),
  });

describe("storyline publication", () => {
  it("requires a sourced contribution for two distinct existing articles", () => {
    expect(publicationIssues(input(), articles)).toEqual([]);
    expect(
      publicationIssues(
        { ...input(), overviewEn: "", articles: [input().articles[0]!] },
        articles,
      ),
    ).toEqual(["overview", "articles"]);
    expect(
      publicationIssues(
        { ...input(), articles: [input().articles[0]!, input().articles[0]!] },
        articles,
      ),
    ).toContain("duplicateArticle");
    expect(publicationIssues(input(), [])).toContain("missingArticle");
    expect(
      publicationIssues(
        {
          ...input(),
          articles: input().articles.map((m) => ({
            ...m,
            noteEn: "",
            evidence: "Invented model claim",
          })),
        },
        articles,
      ),
    ).toEqual(["note", "evidence"]);
  });
  it("matches source text across whitespace and rejects AI-only or trivial evidence", () => {
    expect(validStorylineEvidence("smaller MODEL\nruns", articles[0]!)).toBe(
      true,
    );
    expect(
      validStorylineEvidence("AI is solving everything", articles[0]!),
    ).toBe(false);
    expect(validStorylineEvidence("a", articles[0]!)).toBe(false);
  });
  it("rejects self-links, duplicate relations, and evidence from unattached articles", () => {
    const c = {
      targetId: "s",
      relation: "builds_on" as const,
      explanationEn: "Builds on earlier coverage",
      explanationNl: "",
      fromArticleId: "outside",
      toArticleId: "b",
    };
    expect(
      publicationIssues({ ...input(), id: "s", connections: [c, c] }, articles),
    ).toEqual(["selfConnection", "connectionEvidence", "duplicateConnection"]);
  });
  it("keeps routes safe and reserves the editor route", () => {
    expect(
      storylineInputSchema.safeParse({ ...input(), slug: "manage" }).success,
    ).toBe(false);
    expect(
      storylineInputSchema.safeParse({ ...input(), slug: "../news" }).success,
    ).toBe(false);
  });
});
it("marks English fallback for Dutch editorial content", () => {
  expect(storylineCopy(input(), "nl")).toMatchObject({
    title: "Local AI",
    fallback: true,
  });
  expect(
    storylineCopy(
      { ...input(), titleNl: "Lokale AI", overviewNl: "Op apparaten" },
      "nl",
    ),
  ).toMatchObject({ title: "Lokale AI", fallback: false });
});
it("orders dates with stable ties and separates undated reporting", () => {
  const members = input().articles.map((m, i) => ({
    ...m,
    article: {
      ...articles[i]!,
      publishedAt: i === 0 ? null : new Date("2026-03-01"),
    },
  }));
  const timeline = storylineTimeline(members);
  expect(timeline.dated.map((m) => m.articleId)).toEqual(["b"]);
  expect(timeline.undated.map((m) => m.articleId)).toEqual(["a"]);
  expect(timeline.latestId).toBe("b");
  expect(
    storylineTimeline(
      members.map((m) => ({
        ...m,
        article: { ...m.article, publishedAt: null },
      })),
    ).latestId,
  ).toBeNull();
});

it("reserves static news route names for both editor and agent proposals", () => {
  for (const slug of ["manage", "contribute"])
    expect(storylineInputSchema.safeParse({ ...input(), slug }).success).toBe(
      false,
    );
});
