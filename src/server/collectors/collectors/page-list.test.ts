import { describe, expect, it, vi } from "vitest";

import { inputProblemsOf } from "@/lib/collectors/input-problems";

import type { CollectorStop } from "../errors";
import { collectAll, fakeContext } from "../testing/fake-context";
import { pageList } from "./page-list";

const SPEC = {
  itemSelector: "li.job",
  fields: [
    { name: "title", selector: "a" },
    { name: "link", selector: "a", attribute: "href" },
  ],
  nextPageSelector: "a.next",
};

function page(titles: string[], next?: string): string {
  const items = titles
    .map((t) => `<li class="job"><a href="/jobs/${t}">${t}</a></li>`)
    .join("");
  const nextLink = next ? `<a class="next" href="${next}">Next</a>` : "";
  return `<html><body><ul>${items}</ul>${nextLink}</body></html>`;
}

const input = (overrides: Record<string, unknown> = {}) =>
  pageList.inputSchema.parse({
    url: "https://e.com/jobs",
    ...SPEC,
    ...overrides,
  });

describe("page-list collector", () => {
  it("follows the next-page link and yields the rows of both pages", async () => {
    const { ctx, requests, logs } = fakeContext({
      "https://e.com/jobs": { body: page(["a", "b"], "/jobs?page=2") },
      "https://e.com/jobs?page=2": { body: page(["c"]) },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows).toEqual([
      { title: "a", link: "https://e.com/jobs/a" },
      { title: "b", link: "https://e.com/jobs/b" },
      { title: "c", link: "https://e.com/jobs/c" },
    ]);
    expect(requests).toEqual([
      { url: "https://e.com/jobs", accept: "text/html,application/xhtml+xml" },
      {
        url: "https://e.com/jobs?page=2",
        accept: "text/html,application/xhtml+xml",
      },
    ]);
    expect(logs).toEqual(["Page 1: 2 items.", "Page 2: 1 items."]);
  });

  it("stops when the next link points back to a page it already read", async () => {
    const { ctx, requests } = fakeContext({
      "https://e.com/jobs": { body: page(["a"], "/jobs?page=2") },
      "https://e.com/jobs?page=2": { body: page(["b"], "/jobs#top") },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows.map((r) => r.title)).toEqual(["a", "b"]);
    expect(requests.map((r) => r.url)).toEqual([
      "https://e.com/jobs",
      "https://e.com/jobs?page=2",
    ]);
  });

  it.each(["mailto:jobs@e.com", "javascript:void(0)"])(
    "stops at a %s next link",
    async (next) => {
      const { ctx, requests } = fakeContext({
        "https://e.com/jobs": { body: page(["a"], next) },
      });
      const rows = await collectAll(pageList.run(input(), ctx));
      expect(rows.map((r) => r.title)).toEqual(["a"]);
      expect(requests.map((r) => r.url)).toEqual(["https://e.com/jobs"]);
    },
  );

  it("reads the item itself for a column without a selector", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": {
        body: `<div><a class="job" href="/jobs/1">Engineer</a><a class="job" href="/jobs/2">Designer</a></div>`,
      },
    });
    const extractList = vi.spyOn(ctx, "extractList");
    const rows = await collectAll(
      pageList.run(
        input({
          itemSelector: "a.job",
          fields: [
            { name: "title", selector: "" },
            { name: "link", attribute: "href" },
          ],
        }),
        ctx,
      ),
    );
    expect(extractList).toHaveBeenCalledWith(expect.anything(), {
      itemSelector: "a.job",
      fields: [
        { name: "title", selector: null },
        { name: "link", selector: null, attribute: "href" },
      ],
      nextPageSelector: "a.next",
    });
    expect(rows).toEqual([
      { title: "Engineer", link: "https://e.com/jobs/1" },
      { title: "Designer", link: "https://e.com/jobs/2" },
    ]);
  });

  /** Rows yielded before the run stopped, and the stop itself. */
  async function rowsUntilStop(rows: AsyncIterable<Record<string, unknown>>) {
    const seen: Record<string, unknown>[] = [];
    try {
      for await (const row of rows) seen.push(row);
    } catch (stop) {
      return { rows: seen, stop: stop as CollectorStop };
    }
    throw new Error("expected the run to stop");
  }

  it("ends paging, not the run, at a next link that is not https", async () => {
    const { ctx, requests } = fakeContext({
      "https://e.com/jobs": { body: page(["a"], "http://e.com/jobs?page=2") },
    });
    const { rows, stop } = await rowsUntilStop(pageList.run(input(), ctx));
    expect(rows.map((r) => r.title)).toEqual(["a"]);
    expect(stop).toMatchObject({
      reason: "next_page_not_secure",
      outcome: "succeeded",
    } satisfies Partial<CollectorStop>);
    expect(requests.map((r) => r.url)).toEqual(["https://e.com/jobs"]);
  });

  it("ends paging, not the run, at a next link too long to follow", async () => {
    const { ctx, requests } = fakeContext({
      "https://e.com/jobs": {
        body: page(["a"], `/jobs?q=${"x".repeat(2_100)}`),
      },
    });
    const { rows, stop } = await rowsUntilStop(pageList.run(input(), ctx));
    expect(rows.map((r) => r.title)).toEqual(["a"]);
    expect(stop).toMatchObject({
      reason: "next_page_too_long",
      outcome: "succeeded",
    } satisfies Partial<CollectorStop>);
    expect(requests.map((r) => r.url)).toEqual(["https://e.com/jobs"]);
  });

  it("reads a page in the charset it declares", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": {
        body: Buffer.concat([
          Buffer.from('<ul><li class="job"><a href="/jobs/1">Caf'),
          Buffer.from([0xe9]), // "é" in windows-1252
          Buffer.from("</a></li></ul>"),
        ]),
        headers: { "content-type": "text/html; charset=windows-1252" },
      },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows).toEqual([{ title: "Café", link: "https://e.com/jobs/1" }]);
  });

  it("reads up to five pages by default", () => {
    expect(input().maxPages).toBe(5);
  });

  it("counts a page without a content type as HTML", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": { body: page(["a"]) },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows.map((r) => r.title)).toEqual(["a"]);
  });

  it("accepts an XHTML content type", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": {
        body: page(["a"]),
        headers: { "content-type": "application/xhtml+xml; charset=utf-8" },
      },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows.map((r) => r.title)).toEqual(["a"]);
  });

  it("fails with not_a_page when the address is not HTML", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": {
        body: "{}",
        headers: { "content-type": "application/json" },
      },
    });
    await expect(collectAll(pageList.run(input(), ctx))).rejects.toMatchObject({
      reason: "error",
      outcome: "failed",
      message: "This address is not a web page.",
      detail: { code: "not_a_page" },
    } satisfies Partial<CollectorStop>);
  });

  it("fails with page_status when the page does not answer 2xx", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": { status: 404, body: "" },
    });
    await expect(collectAll(pageList.run(input(), ctx))).rejects.toMatchObject({
      reason: "error",
      outcome: "failed",
      message: "The page answered with status 404.",
      detail: { code: "page_status", params: { status: 404 } },
    } satisfies Partial<CollectorStop>);
  });

  it("logs a cut page and keeps paging", async () => {
    const many = Array.from({ length: 5_001 }, (_, i) => `x${i}`);
    const { ctx, logs } = fakeContext({
      "https://e.com/jobs": { body: page(many, "/jobs?page=2") },
      "https://e.com/jobs?page=2": { body: page(["b"]) },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows).toHaveLength(5_001);
    expect(logs).toEqual([
      "Page 1: 5000 items.",
      "Page 1 had more than we can keep, so some items were left out.",
      "Page 2: 1 items.",
    ]);
  });
  it("stops when a page's address redirects onto a page it already read", async () => {
    const { ctx, requests } = fakeContext({
      "https://e.com/jobs": { body: page(["a"], "/jobs?page=2") },
      "https://e.com/jobs?page=2": {
        url: "https://e.com/jobs",
        body: page(["a"], "/jobs?page=2"),
      },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows.map((r) => r.title)).toEqual(["a"]);
    expect(requests.map((r) => r.url)).toEqual([
      "https://e.com/jobs",
      "https://e.com/jobs?page=2",
    ]);
  });

  it("ends at the page limit while a next link remains", async () => {
    const { ctx, requests } = fakeContext({
      "https://e.com/jobs": { body: page(["a"], "/jobs?page=2") },
    });
    const rows: unknown[] = [];
    await expect(async () => {
      for await (const row of pageList.run(input({ maxPages: 1 }), ctx)) {
        rows.push(row);
      }
    }).rejects.toMatchObject({
      reason: "page_limit",
      outcome: "succeeded",
      message: "Stopped at the page limit.",
    } satisfies Partial<CollectorStop>);
    expect(rows).toEqual([{ title: "a", link: "https://e.com/jobs/a" }]);
    expect(requests.map((r) => r.url)).toEqual(["https://e.com/jobs"]);
  });

  it.each([
    ["not https", "http://e.com/jobs?page=2"],
    ["too long", `/jobs?q=${"x".repeat(2_100)}`],
  ])(
    "ends at the page limit on the last allowed page even when the next link is %s",
    async (_case, next) => {
      const { ctx } = fakeContext({
        "https://e.com/jobs": { body: page(["a"], next) },
      });
      const { stop } = await rowsUntilStop(
        pageList.run(input({ maxPages: 1 }), ctx),
      );
      expect(stop).toMatchObject({
        reason: "page_limit",
        outcome: "succeeded",
      } satisfies Partial<CollectorStop>);
    },
  );

  it("reads text/html with a charset as a web page", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": {
        body: page(["a"]),
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    });
    const rows = await collectAll(pageList.run(input(), ctx));
    expect(rows.map((r) => r.title)).toEqual(["a"]);
  });

  it("fails with not_a_page for a type that only starts like HTML", async () => {
    const { ctx } = fakeContext({
      "https://e.com/jobs": {
        body: page(["a"]),
        headers: { "content-type": "text/html-fragment" },
      },
    });
    await expect(collectAll(pageList.run(input(), ctx))).rejects.toMatchObject({
      detail: { code: "not_a_page" },
    } satisfies Partial<CollectorStop>);
  });
});

describe("page-list input", () => {
  const valid = { url: "https://e.com/jobs", ...SPEC };
  const refused = (overrides: Record<string, unknown>) => {
    const result = pageList.inputSchema.safeParse({ ...valid, ...overrides });
    expect(result.success).toBe(false);
    return result.error?.issues ?? [];
  };

  it("accepts a valid list", () => {
    expect(pageList.inputSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a selector outside the allowlist with a reason code", () => {
    expect(
      inputProblemsOf(refused({ itemSelector: "li:nth-child(2)" })),
    ).toEqual({ itemSelector: ["selector_not_allowed/not_allowed"] });
  });

  it.each([
    ["", "selector_not_allowed/empty"],
    ["li, a", "selector_not_allowed/list"],
    ["li[", "selector_not_allowed/invalid"],
    [`li.${"x".repeat(200)}`, "selector_not_allowed/too_long"],
    ["a b c d e f g h i", "selector_not_allowed/too_complex"],
  ])("names why the item selector %j was refused", (itemSelector, code) => {
    expect(inputProblemsOf(refused({ itemSelector }))).toEqual({
      itemSelector: [code],
    });
  });

  it("checks column and next-page selectors too, each at its own path", () => {
    expect(
      inputProblemsOf(
        refused({
          fields: [
            { name: "t", selector: "a" },
            { name: "u", selector: "a:has(b)" },
          ],
          nextPageSelector: "a ~ b",
        }),
      ),
    ).toEqual({
      "fields.1.selector": ["selector_not_allowed/not_allowed"],
      nextPageSelector: ["selector_not_allowed/not_allowed"],
    });
  });

  it("refuses duplicate column names at the repeated name", () => {
    const issues = refused({
      fields: [
        { name: "title", selector: "a" },
        { name: "title", selector: "b" },
      ],
    });
    expect(inputProblemsOf(issues)).toEqual({
      "fields.1.name": ["duplicate_name"],
    });
  });

  it("refuses more than 20 columns", () => {
    const fields = Array.from({ length: 21 }, (_, i) => ({
      name: `c${i}`,
      selector: "a",
    }));
    refused({ fields });
    expect(
      pageList.inputSchema.safeParse({ ...valid, fields: fields.slice(0, 20) })
        .success,
    ).toBe(true);
  });

  it("refuses no columns at all", () => {
    refused({ fields: [] });
  });

  it("refuses an http:// address", () => {
    refused({ url: "http://e.com/jobs" });
  });

  it("refuses an attribute name like 'on click'", () => {
    refused({ fields: [{ name: "t", selector: "a", attribute: "on click" }] });
  });

  it("refuses a column name that is not a plain word", () => {
    refused({ fields: [{ name: "1st", selector: "a" }] });
    refused({ fields: [{ name: "a".repeat(41), selector: "a" }] });
  });

  it("refuses maxPages outside 1–20", () => {
    refused({ maxPages: 0 });
    refused({ maxPages: 21 });
    refused({ maxPages: 1.5 });
  });
});
