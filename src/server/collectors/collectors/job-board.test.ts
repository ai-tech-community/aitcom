import { describe, expect, it } from "vitest";

import { collectAll, fakeContext } from "../testing/fake-context";
import { jobBoard } from "./job-board";
import ashbyFixture from "@/lib/job-boards/fixtures/ashby.json";

const url = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const input = { board: "greenhouse" as const, name: "acme" };

describe("job-board collector", () => {
  it("collects Workable descriptions through the worker and preserves date precision", async () => {
    const url = "https://www.workable.com/api/accounts/careers?details=true";
    const { ctx, requests, logs } = fakeContext({
      [url]: {
        url: "https://apply.workable.com/api/v1/widget/accounts/careers?details=true",
        body: JSON.stringify({
          jobs: [
            {
              title: "Engineer",
              url: "https://apply.workable.com/j/A3269A621A",
              application_url: "https://apply.workable.com/j/A3269A621A/apply",
              published_on: "2026-10-27",
              description:
                "<h2>About us</h2><p>Build <b>useful</b> things.</p><script>bad()</script>",
              employment_type: "Full-time",
              workplace_type: "hybrid",
            },
          ],
        }),
      },
    });
    const rows = await collectAll(
      jobBoard.run({ board: "workable", name: "careers" }, ctx),
    );
    expect(rows[0]).toMatchObject({
      description: "About us\n\nBuild useful things.",
      postedAt: "2026-10-27",
      applyUrl: "https://apply.workable.com/j/A3269A621A/apply",
      employmentType: "Full-time",
      workplaceType: "Hybrid",
    });
    expect(rows[0]).not.toHaveProperty("descriptionMarkup");
    expect(jobBoard.itemSchema.safeParse(rows[0]).success).toBe(true);
    expect(requests).toEqual([{ url, accept: "application/json" }]);
    expect(logs).toEqual(["Found 1 job."]);
  });

  it("handles empty, missing and unreadable Workable boards", async () => {
    for (const [status, body, detail] of [
      [200, '{"jobs":[]}', null],
      [
        404,
        "Not Found",
        { code: "board_not_found", params: { host: "apply.workable.com" } },
      ],
      [403, "Forbidden", { code: "board_status", params: { status: 403 } }],
      [200, "{}", { code: "board_response_invalid" }],
      [200, "not JSON", { code: "board_response_invalid" }],
    ] as const) {
      const { ctx } = fakeContext({
        "https://www.workable.com/api/accounts/careers?details=true": {
          status,
          body,
        },
      });
      const run = collectAll(
        jobBoard.run({ board: "workable", name: "careers" }, ctx),
      );
      if (detail) await expect(run).rejects.toMatchObject({ detail });
      else expect(await run).toEqual([]);
    }
  });

  const leverUrl = (skip = 0, eu = false) =>
    `https://api.${eu ? "eu." : ""}lever.co/v0/postings/acme?mode=json&limit=100&skip=${skip}`;
  const leverJob = (id: number) => ({
    text: `Job ${id}`,
    hostedUrl: `https://jobs.lever.co/acme/${id}`,
  });

  it("collects Lever's complete description, lists and closing without additional fetches", async () => {
    const { ctx, requests, logs } = fakeContext({
      [leverUrl()]: {
        body: JSON.stringify([
          {
            ...leverJob(1),
            descriptionPlain: "Build <tools>",
            lists: [
              {
                text: "Skills",
                content:
                  "<li>TypeScript</li><li>Curiosity</li><script>bad()</script>",
              },
            ],
            additionalPlain: "Join us",
            applyUrl: "https://jobs.lever.co/acme/1/apply",
            workplaceType: "remote",
          },
        ]),
      },
    });
    const rows = await collectAll(
      jobBoard.run({ board: "lever", name: "acme" }, ctx),
    );
    expect(rows[0]).toMatchObject({
      description:
        "Build <tools>\n\nSkills\n\nTypeScript\n\nCuriosity\n\nJoin us",
      workplaceType: "Remote",
      applyUrl: "https://jobs.lever.co/acme/1/apply",
    });
    expect(rows[0]).not.toHaveProperty("descriptionMarkup");
    expect(jobBoard.itemSchema.safeParse(rows[0]).success).toBe(true);
    expect(requests).toHaveLength(1);
    expect(logs).toEqual(["Page 1: 1 job."]);
  });

  it("paginates using the raw page length and deduplicates overlapping postings", async () => {
    const first = Array.from({ length: 100 }, (_, i) => leverJob(i));
    const { ctx, requests } = fakeContext({
      [leverUrl()]: { body: JSON.stringify(first) },
      [leverUrl(100)]: { body: JSON.stringify(first) },
      [leverUrl(200)]: { body: JSON.stringify([leverJob(100)]) },
    });
    const rows = await collectAll(
      jobBoard.run({ board: "lever", name: "acme" }, ctx),
    );
    expect(rows).toHaveLength(101);
    expect(requests.map((r) => r.url)).toEqual([
      leverUrl(),
      leverUrl(100),
      leverUrl(200),
    ]);
  });

  it("reports partial results when the final allowed page is full", async () => {
    const pages = Object.fromEntries(
      Array.from({ length: 5 }, (_, page) => [
        leverUrl(page * 100),
        {
          body: JSON.stringify(
            Array.from({ length: 100 }, (_, i) => leverJob(page * 100 + i)),
          ),
        },
      ]),
    );
    const { ctx, requests } = fakeContext(pages);
    const rows: unknown[] = [];
    const run = async () => {
      for await (const row of jobBoard.run(
        { board: "lever", name: "acme" },
        ctx,
      ))
        rows.push(row);
    };
    await expect(run()).rejects.toMatchObject({
      reason: "page_limit",
      outcome: "succeeded",
    });
    expect(rows).toHaveLength(500);
    expect(requests).toHaveLength(5);
  });

  it.each([false, true])(
    "handles empty, missing and malformed Lever boards (EU: %s)",
    async (eu) => {
      const input = {
        board: eu ? ("lever-eu" as const) : ("lever" as const),
        name: "acme",
      };
      for (const [status, body, detail] of [
        [200, "[]", null],
        [
          404,
          "",
          {
            code: "board_not_found",
            params: { host: eu ? "jobs.eu.lever.co" : "jobs.lever.co" },
          },
        ],
        [503, "", { code: "board_status", params: { status: 503 } }],
        [200, "{}", { code: "board_response_invalid" }],
        [200, "not JSON", { code: "board_response_invalid" }],
      ] as const) {
        const { ctx } = fakeContext({ [leverUrl(0, eu)]: { status, body } });
        if (detail)
          await expect(
            collectAll(jobBoard.run(input, ctx)),
          ).rejects.toMatchObject({ detail });
        else expect(await collectAll(jobBoard.run(input, ctx))).toEqual([]);
      }
    },
  );

  it("converts encoded Greenhouse descriptions through the context without leaking markup", async () => {
    const { ctx, requests } = fakeContext({
      [url]: {
        body: JSON.stringify({
          jobs: [
            {
              title: "Engineer",
              absolute_url: "https://example.com/job/1",
              content:
                "&lt;p&gt;Build &amp;amp; learn&lt;/p&gt;&lt;p&gt;With us&lt;/p&gt;",
              metadata: [
                { name: "Employment Type", value: "Contract" },
                { name: "Workplace Type", value: "Hybrid" },
              ],
            },
          ],
        }),
      },
    });
    const rows = await collectAll(jobBoard.run(input, ctx));
    expect(rows[0]).toMatchObject({
      description: "Build & learn\n\nWith us",
      applyUrl: "https://example.com/job/1",
      employmentType: "Contract",
      workplaceType: "Hybrid",
      descriptionTruncated: false,
    });
    expect(rows[0]).not.toHaveProperty("descriptionMarkup");
    expect(jobBoard.itemSchema.safeParse(rows[0]).success).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it("prefers Ashby plain text, falls back to sandboxed HTML, and omits unlisted jobs", async () => {
    const { ctx } = fakeContext({
      "https://api.ashbyhq.com/posting-api/job-board/Ashby": {
        body: JSON.stringify({
          jobs: [
            {
              title: "Plain",
              jobUrl: "https://example.com/1",
              descriptionPlain: "Readable\n\nAlready",
              descriptionHtml: "<p>Wrong</p>",
              applyUrl: "https://example.com/1/apply",
              employmentType: "FullTime",
              workplaceType: "Remote",
            },
            {
              title: "HTML",
              jobUrl: "https://example.com/2",
              descriptionPlain: " ",
              descriptionHtml: "<p>Fallback</p><script>bad()</script>",
            },
            { isListed: false, descriptionHtml: "private" },
          ],
        }),
      },
    });
    const rows = await collectAll(
      jobBoard.run({ board: "ashby", name: "Ashby" }, ctx),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      description: "Readable\n\nAlready",
      applyUrl: "https://example.com/1/apply",
      employmentType: "FullTime",
      workplaceType: "Remote",
    });
    expect(rows[1]).toMatchObject({ description: "Fallback", applyUrl: null });
    expect(rows.every((row) => !Object.hasOwn(row, "descriptionMarkup"))).toBe(
      true,
    );
  });

  const ashbyUrl = "https://api.ashbyhq.com/posting-api/job-board/Ashby";
  const ashbyInput = { board: "ashby" as const, name: "Ashby" };

  it("collects listed Ashby jobs through the same context and shared result columns", async () => {
    const { ctx, requests, logs } = fakeContext({
      [ashbyUrl]: { body: JSON.stringify(ashbyFixture) },
    });
    const rows = await collectAll(jobBoard.run(ashbyInput, ctx));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      title: "Engineering Manager - EU",
      location: "Remote - European Union",
      department: "Engineering",
      url: "https://jobs.ashbyhq.com/Ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2",
      postedAt: "2024-03-04T14:29:08.532Z",
      description: null,
      applyUrl:
        "https://jobs.ashbyhq.com/Ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application",
      employmentType: null,
      workplaceType: null,
      descriptionTruncated: false,
    });
    expect(requests).toEqual([{ url: ashbyUrl, accept: "application/json" }]);
    expect(logs).toEqual(["Found 2 jobs."]);
  });

  it("finishes an empty Ashby board normally", async () => {
    const { ctx } = fakeContext({ [ashbyUrl]: { body: '{"jobs":[]}' } });
    expect(await collectAll(jobBoard.run(ashbyInput, ctx))).toEqual([]);
  });

  it.each([
    [
      404,
      "",
      { code: "board_not_found", params: { host: "jobs.ashbyhq.com" } },
    ],
    [500, "", { code: "board_status", params: { status: 500 } }],
    [200, "not JSON", { code: "board_response_invalid" }],
    [200, "{}", { code: "board_response_invalid" }],
  ])("explains an Ashby source failure (%s)", async (status, body, detail) => {
    const { ctx } = fakeContext({ [ashbyUrl]: { status, body } });
    await expect(
      collectAll(jobBoard.run(ashbyInput, ctx)),
    ).rejects.toMatchObject({ outcome: "failed", detail });
  });
  it("fetches the board through the guarded context and yields exportable job rows", async () => {
    const { ctx, requests, logs } = fakeContext({
      [url]: {
        body: JSON.stringify({
          jobs: [
            {
              title: "Engineer",
              absolute_url: "https://example.com/job/1",
              location: { name: "Remote" },
              departments: [{ name: "Engineering" }],
            },
          ],
        }),
      },
    });
    expect(await collectAll(jobBoard.run(input, ctx))).toEqual([
      {
        title: "Engineer",
        location: "Remote",
        department: "Engineering",
        url: "https://example.com/job/1",
        postedAt: null,
        description: null,
        applyUrl: "https://example.com/job/1",
        employmentType: null,
        workplaceType: null,
        descriptionTruncated: false,
      },
    ]);
    expect(requests).toEqual([{ url, accept: "application/json" }]);
    expect(logs).toEqual(["Found 1 job."]);
  });

  it("succeeds with zero rows for a board with no published jobs", async () => {
    const { ctx } = fakeContext({ [url]: { body: '{"jobs":[]}' } });
    expect(await collectAll(jobBoard.run(input, ctx))).toEqual([]);
  });

  it.each([
    [
      404,
      "",
      { code: "board_not_found", params: { host: "boards.greenhouse.io" } },
    ],
    [500, "", { code: "board_status", params: { status: 500 } }],
    [200, "<html>Not JSON</html>", { code: "board_response_invalid" }],
    [200, "{}", { code: "board_response_invalid" }],
  ])("explains a bad source response (%s)", async (status, body, detail) => {
    const { ctx } = fakeContext({ [url]: { status, body } });
    await expect(collectAll(jobBoard.run(input, ctx))).rejects.toMatchObject({
      outcome: "failed",
      detail,
    });
  });

  it("refuses unavailable boards and invalid account names before a run starts", () => {
    expect(jobBoard.inputSchema.safeParse(input).success).toBe(true);
    expect(jobBoard.inputSchema.safeParse(ashbyInput).success).toBe(true);
    expect(
      jobBoard.inputSchema.safeParse({ ...input, board: "personio" }).success,
    ).toBe(false);
    expect(
      jobBoard.inputSchema.safeParse({ ...input, name: "../acme" }).success,
    ).toBe(false);
  });
});
