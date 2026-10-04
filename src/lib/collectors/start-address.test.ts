import { describe, expect, it } from "vitest";

import { RECOGNISED_PARAM, readStartQuery, startHref } from "./start-address";

describe("startHref", () => {
  it("is the preset's start page", () => {
    expect(startHref("feed")).toBe("/dashboard/collectors/new/feed");
  });

  it("carries the prefill and the recognised mark in the query", () => {
    expect(
      startHref("custom-page", {
        prefill: { url: "https://example.com/jobs?a=1&b=2" },
        recognised: true,
      }),
    ).toBe(
      "/dashboard/collectors/new/custom-page?url=https%3A%2F%2Fexample.com%2Fjobs%3Fa%3D1%26b%3D2&recognised=1",
    );
  });

  it("never lets a prefill value pose as the recognised mark", () => {
    expect(startHref("feed", { prefill: { [RECOGNISED_PARAM]: "1" } })).toBe(
      "/dashboard/collectors/new/feed",
    );
  });
});

describe("readStartQuery", () => {
  it("reads back what startHref wrote", () => {
    const href = startHref("custom-page", {
      prefill: { url: "https://example.com/jobs?a=1&b=2", name: "acme" },
      recognised: true,
    });
    const query = Object.fromEntries(
      new URL(href, "https://x.test").searchParams,
    );
    expect(readStartQuery(query)).toEqual({
      prefill: { url: "https://example.com/jobs?a=1&b=2", name: "acme" },
      recognised: true,
    });
  });

  it("takes the first of repeated values and ignores missing ones", () => {
    expect(
      readStartQuery({
        url: ["https://a.example/", "https://b.example/"],
        none: undefined,
      }),
    ).toEqual({
      prefill: { url: "https://a.example/" },
      recognised: false,
    });
  });

  it("keeps odd names as plain data", () => {
    const { prefill } = readStartQuery({
      __proto__: "x",
      constructor: "y",
    } as never);
    expect(Object.getPrototypeOf(prefill)).toBe(Object.prototype);
    expect(prefill.constructor).toBe("y");
  });

  it("is not recognised unless the mark says exactly 1", () => {
    expect(readStartQuery({ recognised: "true" }).recognised).toBe(false);
  });
});
