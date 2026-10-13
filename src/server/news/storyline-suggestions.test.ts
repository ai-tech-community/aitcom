import { beforeEach, expect, it, vi } from "vitest";
import { storyFixture } from "@/test/news-storyline-fixture";
vi.mock("@/server/db", () => ({ db: {} }));
import {
  claimStorylineSuggestion,
  generateStorylineSuggestions,
  requestStorylineProposals,
  suggestConfiguredStorylines,
} from "./storyline-suggestions";

const candidates = storyFixture.articles.map((m) => m.article);
const proposals = () => ({
  proposals: [
    {
      slug: "local-ai",
      titleEn: "AI on devices",
      overviewEn: "A shift to local processing",
      questionsEn: [],
      articles: storyFixture.articles
        .slice(0, 2)
        .map(({ articleId, noteEn, evidence }) => ({
          articleId,
          noteEn,
          evidence,
        })),
    },
  ],
});
const deps = () => ({
  loadArticles: vi.fn().mockResolvedValue(candidates),
  occupiedSlugs: vi.fn().mockResolvedValue([]),
  propose: vi.fn().mockResolvedValue(proposals()),
});
beforeEach(() => {
  vi.unstubAllEnvs();
});
it("returns unsaved valid drafts without a write dependency", async () => {
  const result = await generateStorylineSuggestions(deps());
  expect(result.inspectedArticles).toBe(3);
  expect(result.drafts[0]?.input.status).toBe("draft");
  expect(result.drafts[0]?.input.id).toBeUndefined();
});
it("skips the provider when fewer than two articles are available", async () => {
  const d = deps();
  d.loadArticles.mockResolvedValue(candidates.slice(0, 1));
  expect((await generateStorylineSuggestions(d)).drafts).toEqual([]);
  expect(d.propose).not.toHaveBeenCalled();
});
it("bounds article and excerpt volume before invoking the provider", async () => {
  const d = deps();
  d.loadArticles.mockResolvedValue(
    Array.from({ length: 80 }, (_, i) => ({
      ...candidates[0]!,
      id: String(i),
      title: "a".repeat(2000),
      summary: "b".repeat(4000),
    })),
  );
  d.propose.mockResolvedValue({ proposals: [] });
  await generateStorylineSuggestions(d);
  const sent = d.propose.mock.calls[0]![0];
  expect(sent).toHaveLength(40);
  expect(sent[0].title).toHaveLength(500);
  expect(sent[0].summary).toHaveLength(2000);
});
it("rejects invalid output and translates provider timeouts into a recoverable failure", async () => {
  const d = deps();
  d.propose.mockResolvedValue({
    proposals: [{ ...proposals().proposals[0], articles: [] }],
  });
  await expect(generateStorylineSuggestions(d)).rejects.toMatchObject({
    code: "invalid",
  });
  d.propose.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
  await expect(generateStorylineSuggestions(d)).rejects.toMatchObject({
    code: "provider",
  });
});
it("uses a bounded structured-tool request containing only supplied reporting", async () => {
  const mockedFetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "suggest_storylines",
              input: proposals(),
            },
          ],
        }),
        { status: 200 },
      ),
    );
  expect(
    await requestStorylineProposals(candidates, {
      key: "test-key",
      model: "configured-model",
      fetch: mockedFetch,
    }),
  ).toEqual(proposals());
  const options = mockedFetch.mock.calls[0]![1];
  expect(options.signal).toBeInstanceOf(AbortSignal);
  const body = JSON.parse(options.body);
  expect(body.model).toBe("configured-model");
  expect(body.tool_choice).toEqual({
    type: "tool",
    name: "suggest_storylines",
  });
  expect(body.max_tokens).toBe(6144);
  const sent = JSON.parse(body.messages[0].content);
  expect(Object.keys(sent[0])).toEqual([
    "articleId",
    "title",
    "url",
    "publishedAt",
    "excerpt",
  ]);
});
it("does not accept prose or non-success responses as drafts", async () => {
  await expect(
    requestStorylineProposals(candidates, {
      key: "k",
      model: "m",
      fetch: vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    }),
  ).rejects.toMatchObject({ code: "provider" });
  await expect(
    requestStorylineProposals(candidates, {
      key: "k",
      model: "m",
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              content: [{ type: "text", text: "invented prose" }],
            }),
          ),
        ),
    }),
  ).rejects.toMatchObject({ code: "invalid" });
});
it("requires configuration before any storage access and applies a per-editor cooldown", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  await expect(suggestConfiguredStorylines("no-key")).rejects.toMatchObject({
    code: "configuration",
  });
  claimStorylineSuggestion("cooldown-test", 100);
  expect(() => claimStorylineSuggestion("cooldown-test", 101)).toThrow(
    "cooldown",
  );
  expect(() => claimStorylineSuggestion("other-editor", 101)).not.toThrow();
  expect(() => claimStorylineSuggestion("cooldown-test", 60_100)).not.toThrow();
});
