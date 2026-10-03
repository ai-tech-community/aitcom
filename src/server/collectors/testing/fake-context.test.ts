// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CollectorStop } from "../errors";
import { fakeContext } from "./fake-context";

describe("fake context extractList", () => {
  it("runs the real extraction, resolving links against the page's URL", async () => {
    const { ctx } = fakeContext({});
    const result = await ctx.extractList(
      {
        html: `<ul><li><a href="/a">A</a></li><li><a href="b">B</a></li></ul>
          <a class="next" href="?page=2">Next</a>`,
        url: "https://e.com/list/",
      },
      {
        itemSelector: "li",
        fields: [
          { name: "title", selector: "a" },
          { name: "link", selector: "a", attribute: "href" },
        ],
        nextPageSelector: "a.next",
      },
    );
    expect(result).toEqual({
      rows: [
        { title: "A", link: "https://e.com/a" },
        { title: "B", link: "https://e.com/list/b" },
      ],
      nextUrl: "https://e.com/list/?page=2",
      nextUrlTooLong: false,
      truncated: false,
    });
  });

  it("refuses a selector the way the live context does", async () => {
    const { ctx } = fakeContext({});
    const stop = await ctx
      .extractList(
        { html: "<ul><li>A</li></ul>", url: "https://e.com/" },
        { itemSelector: "li:nth-child(2)", fields: [] },
      )
      .catch((err: unknown) => err);
    expect(stop).toBeInstanceOf(CollectorStop);
    expect((stop as CollectorStop).detail).toEqual({
      code: "selector_not_allowed",
    });
  });
});
