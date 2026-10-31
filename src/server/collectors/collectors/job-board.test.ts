import { describe, expect, it } from "vitest";

import { collectAll, fakeContext } from "../testing/fake-context";
import { jobBoard } from "./job-board";
import ashbyFixture from "@/lib/job-boards/fixtures/ashby.json";

const url = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const input = { board: "greenhouse" as const, name: "acme" };

describe("job-board collector", () => {
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
      jobBoard.inputSchema.safeParse({ ...input, board: "lever" }).success,
    ).toBe(false);
    expect(
      jobBoard.inputSchema.safeParse({ ...input, name: "../acme" }).success,
    ).toBe(false);
  });
});
