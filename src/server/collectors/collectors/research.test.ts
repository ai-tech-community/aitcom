import { describe, expect, it } from "vitest";
import { collectAll, fakeContext } from "../testing/fake-context";
import { hackerNews, recognizeHackerNews } from "./hacker-news";
import {
  githubRepositories,
  recognizeGithubOrganization,
} from "./github-repositories";
const hn = "https://hacker-news.firebaseio.com/v0";
const repos =
  "https://api.github.com/orgs/octokit/repos?type=public&sort=full_name&direction=asc&per_page=100&page=";
const repo = (id: number) => ({
  name: `repo${id}`,
  html_url: `https://github.com/octokit/repo${id}`,
  stargazers_count: id,
  forks_count: 2,
  archived: false,
  private: false,
  updated_at: "2026-10-31T12:00:00Z",
});
describe("Research collectors", () => {
  it("reads bounded unique story IDs, preserves source data and logs unavailable items", async () => {
    const { ctx, requests, logs } = fakeContext({
      [`${hn}/askstories.json`]: { body: "[1,1,2,3,4]" },
      [`${hn}/item/1.json`]: {
        body: JSON.stringify({
          id: 1,
          type: "story",
          title: "Ask HN",
          score: 5,
          descendants: 4,
          by: "greg",
          time: 0,
          url: "javascript:bad()",
        }),
      },
      [`${hn}/item/2.json`]: { body: "null" },
      [`${hn}/item/3.json`]: { body: '{"deleted":true}' },
    });
    const rows = await collectAll(
      hackerNews.run({ list: "ask", limit: 3 }, ctx),
    );
    expect(rows).toEqual([
      {
        title: "Ask HN",
        url: "https://news.ycombinator.com/item?id=1",
        points: 5,
        comments: 4,
        author: "greg",
        publishedAt: "1970-01-01T00:00:00.000Z",
        discussionUrl: "https://news.ycombinator.com/item?id=1",
      },
    ]);
    expect(hackerNews.itemSchema.safeParse(rows[0]).success).toBe(true);
    expect(requests).toHaveLength(4);
    expect(logs.join(" ")).toContain("2 skipped");
  });
  it("rejects mismatched or malformed stories instead of silently yielding corrupt data", async () => {
    const { ctx } = fakeContext({
      [`${hn}/topstories.json`]: { body: "[1]" },
      [`${hn}/item/1.json`]: {
        body: '{"id":2,"type":"story","title":"Wrong"}',
      },
    });
    await expect(
      collectAll(hackerNews.run({ list: "top", limit: 1 }, ctx)),
    ).rejects.toMatchObject({ detail: { code: "source_response_invalid" } });
  });
  it("paginates public repositories using fixed API addresses and keeps descriptions and counters", async () => {
    const { ctx, requests } = fakeContext({
      [`${repos}1`]: {
        body: JSON.stringify(Array.from({ length: 100 }, (_, i) => repo(i))),
      },
      [`${repos}2`]: { body: JSON.stringify([repo(100)]) },
    });
    const rows = await collectAll(
      githubRepositories.run({ organization: "octokit", limit: 200 }, ctx),
    );
    expect(rows).toHaveLength(101);
    expect(rows[100]).toMatchObject({
      name: "repo100",
      description: null,
      stars: 100,
      updatedAt: "2026-10-31T12:00:00Z",
    });
    expect(requests.map((r) => r.url)).toEqual([`${repos}1`, `${repos}2`]);
  });
  it("retains the requested prefix with an honest partial stop", async () => {
    const { ctx } = fakeContext({
      [`${repos}1`]: { body: JSON.stringify([repo(1), repo(2)]) },
    });
    const run = githubRepositories
      .run({ organization: "octokit", limit: 1 }, ctx)
      [Symbol.asyncIterator]();
    expect((await run.next()).value).toMatchObject({ name: "repo1" });
    await expect(run.next()).rejects.toMatchObject({
      reason: "item_limit",
      outcome: "succeeded",
    });
  });
  it.each([
    [404, "", {}, "github_organization_not_found"],
    [429, "", {}, "source_rate_limited"],
    [403, "", { "x-ratelimit-remaining": "0" }, "source_rate_limited"],
    [500, "", {}, "source_status"],
    [200, "no json", {}, "source_response_invalid"],
  ])("explains a source refusal (%s)", async (status, body, headers, code) => {
    const { ctx } = fakeContext({
      [`${repos}1`]: {
        status: status as number,
        body: body as string,
        headers: headers as Record<string, string>,
      },
    });
    await expect(
      collectAll(
        githubRepositories.run({ organization: "octokit", limit: 100 }, ctx),
      ),
    ).rejects.toMatchObject({ detail: { code } });
  });
  it("keeps empty organizations valid and skips private entries defensively", async () => {
    const { ctx } = fakeContext({
      [`${repos}1`]: { body: JSON.stringify([{ ...repo(1), private: true }]) },
    });
    expect(
      await collectAll(
        githubRepositories.run({ organization: "octokit", limit: 100 }, ctx),
      ),
    ).toEqual([]);
  });
  it("recognizes only supported source lists and organization addresses", () => {
    expect(
      recognizeHackerNews(new URL("https://news.ycombinator.com/show")),
    ).toEqual({ list: "show" });
    expect(
      recognizeHackerNews(new URL("https://news.ycombinator.com/item?id=1")),
    ).toBeNull();
    expect(
      recognizeGithubOrganization(
        new URL("https://github.com/orgs/octokit/repositories"),
      ),
    ).toBe("octokit");
    for (const url of [
      "https://github.com/octokit/rest.js",
      "https://github.com/topics",
      "https://github.com.evil.test/octokit",
      "http://github.com/octokit",
    ]) {
      expect(recognizeGithubOrganization(new URL(url))).toBeNull();
    }
  });
});
