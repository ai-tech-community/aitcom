import { describe, expect, it } from "vitest";

import { collectAll, fakeContext } from "../testing/fake-context";
import { jobBoard } from "./job-board";

const url = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const input = { board: "greenhouse" as const, name: "acme" };

describe("job-board collector", () => {
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
    expect(
      jobBoard.inputSchema.safeParse({ ...input, board: "ashby" }).success,
    ).toBe(false);
    expect(
      jobBoard.inputSchema.safeParse({ ...input, name: "../acme" }).success,
    ).toBe(false);
  });
});
