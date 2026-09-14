import { describe, expect, it, vi } from "vitest";

import { refreshAwesomeStarCounts } from "./refresh-stars";

describe("refreshAwesomeStarCounts", () => {
  it("writes fetched GitHub/GitLab counts and skips soft-failures", async () => {
    const updates: Array<{
      id: string;
      starCount: number;
      checkedAt: Date;
    }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.github.com/graphql")) {
        return new Response(
          JSON.stringify({
            data: {
              r0: { stargazers: { totalCount: 12_400 } },
              r1: null,
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("gitlab.com/api/v4/projects/")) {
        return new Response(JSON.stringify({ star_count: 320 }), {
          status: 200,
        });
      }
      return new Response("nope", { status: 500 });
    });

    const result = await refreshAwesomeStarCounts({
      listProjects: async () => [
        {
          id: "curated-ollama",
          repoUrl: "https://github.com/ollama/ollama",
          repoHost: "github",
        },
        {
          id: "curated-missing",
          repoUrl: "https://github.com/missing/repo",
          repoHost: "github",
        },
        {
          id: "curated-gitlab",
          repoUrl: "https://gitlab.com/gitlab-org/gitlab",
          repoHost: "gitlab",
        },
      ],
      updateStars: async (id, starCount, checkedAt) => {
        updates.push({ id, starCount, checkedAt });
      },
      fetchImpl,
      now: new Date("2026-09-14T08:00:00.000Z"),
      githubToken: "test-token",
    });

    expect(result).toEqual({ updated: 2, failed: 1 });
    expect(updates.map((row) => row.id).sort()).toEqual([
      "curated-gitlab",
      "curated-ollama",
    ]);
    expect(updates.find((row) => row.id === "curated-ollama")?.starCount).toBe(
      12_400,
    );
    expect(updates.find((row) => row.id === "curated-gitlab")?.starCount).toBe(
      320,
    );
    expect(updates.some((row) => row.starCount === 0)).toBe(false);
  });

  it("does not invent counts when the host APIs soft-fail", async () => {
    const updates: string[] = [];
    const result = await refreshAwesomeStarCounts({
      listProjects: async () => [
        {
          id: "curated-ollama",
          repoUrl: "https://github.com/ollama/ollama",
          repoHost: "github",
        },
      ],
      updateStars: async (id) => {
        updates.push(id);
      },
      fetchImpl: async () => new Response("rate limited", { status: 403 }),
      now: new Date("2026-09-14T08:00:00.000Z"),
      githubToken: "test-token",
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(1);
    expect(updates).toEqual([]);
  });
});
