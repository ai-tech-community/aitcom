import { expect, it, vi } from "vitest";
import { registerNewsTools } from "./news-tools";
import { DRAFT_FOR_REVIEW, READ_ONLY } from "@/server/mcp/tool-annotations";

it("registers scoped read and draft-only news tools that delegate to authenticated procedures", async () => {
  const tools = new Map<
    string,
    { config: Record<string, unknown>; run: (input: never) => Promise<unknown> }
  >();
  const server = {
    registerTool: (
      name: string,
      config: Record<string, unknown>,
      run: (input: never) => Promise<unknown>,
    ) => tools.set(name, { config, run }),
  };
  const caller = {
    agent: {
      browseNewsResearch: vi.fn().mockResolvedValue({ items: [] }),
      reserveNewsStoryline: vi.fn().mockResolvedValue({ reservationId: "r1" }),
      releaseNewsStoryline: vi.fn().mockResolvedValue({ released: true }),
      browseNews: vi.fn().mockResolvedValue({ items: [] }),
      browseNewsStorylines: vi.fn().mockResolvedValue({ items: [] }),
      proposeNewsStoryline: vi
        .fn()
        .mockResolvedValue({ mode: "draft", draftId: "d1" }),
    },
  };
  registerNewsTools(server as never, caller as never);
  expect([...tools.keys()]).toEqual([
    "browse-news",
    "browse-news-storylines",
    "propose-news-storyline",
    "browse-news-research",
    "reserve-news-storyline",
    "release-news-storyline",
  ]);
  expect(tools.get("browse-news")!.config.annotations).toEqual(READ_ONLY);
  expect(tools.get("browse-news-storylines")!.config.annotations).toEqual(
    READ_ONLY,
  );
  expect(tools.get("propose-news-storyline")!.config.annotations).toEqual(
    DRAFT_FOR_REVIEW,
  );
  const topic = { topicKey: "local-ai", title: "Local AI" };
  await tools.get("reserve-news-storyline")!.run(topic as never);
  expect(caller.agent.reserveNewsStoryline).toHaveBeenCalledWith(topic);
  await tools
    .get("release-news-storyline")!
    .run({ reservationId: "r1" } as never);
  expect(caller.agent.releaseNewsStoryline).toHaveBeenCalledWith({
    reservationId: "r1",
  });
  const query = { q: "local", page: 2 };
  await tools.get("browse-news")!.run(query as never);
  expect(caller.agent.browseNews).toHaveBeenCalledWith(query);
  const proposal = {
    reservationId: "r1",
    slug: "local-ai",
    titleEn: "Local AI",
    overviewEn: "Overview",
    articles: [],
  };
  const result = await tools
    .get("propose-news-storyline")!
    .run(proposal as never);
  expect(caller.agent.proposeNewsStoryline).toHaveBeenCalledWith(proposal);
  expect(result).toMatchObject({
    content: [
      { type: "text", text: expect.stringContaining('"mode": "draft"') },
    ],
  });
});
