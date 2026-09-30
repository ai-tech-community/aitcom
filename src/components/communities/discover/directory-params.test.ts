import { describe, expect, it } from "vitest";
import {
  DIRECTORY_PAGE_SIZE,
  gridQueryInput,
  parseDirectoryParams,
  squareQueryInput,
  writeDirectoryParams,
} from "./directory-params";
import { MAX_STREET_HOUSES } from "./community-street-scene";

const parse = (qs: string) => parseDirectoryParams(new URLSearchParams(qs));

describe("parseDirectoryParams", () => {
  it("defaults to everything, most active first", () => {
    expect(parse("")).toEqual({ q: "", place: null, sort: "active" });
  });

  it("reads search, place and sort", () => {
    expect(parse("q=%20agents%20&place=Utrecht&sort=newest")).toEqual({
      q: "agents",
      place: "Utrecht",
      sort: "newest",
    });
  });

  it("ignores an unknown sort and caps long values", () => {
    const p = parse(`sort=trending&q=${"a".repeat(300)}`);
    expect(p.sort).toBe("active");
    expect(p.q).toHaveLength(100);
  });
});

describe("writeDirectoryParams", () => {
  it("keeps defaults out of the URL and other params untouched", () => {
    const next = writeDirectoryParams(new URLSearchParams("create=1&q=old"), {
      q: "",
      place: null,
      sort: "active",
    });
    expect(next.toString()).toBe("create=1");
  });

  it("round-trips through parse", () => {
    const params = { q: "mlops", place: "online", sort: "largest" as const };
    expect(
      parseDirectoryParams(writeDirectoryParams(new URLSearchParams(), params)),
    ).toEqual(params);
  });
});

describe("query inputs", () => {
  it("builds the same grid input on server and client", () => {
    expect(gridQueryInput(parse("place=Utrecht"), "nl")).toEqual({
      q: undefined,
      place: "Utrecht",
      sort: "active",
      limit: DIRECTORY_PAGE_SIZE,
      locale: "nl",
    });
  });

  it("asks the square for one community per house", () => {
    expect(squareQueryInput("en")).toEqual({
      sort: "active",
      limit: MAX_STREET_HOUSES,
      locale: "en",
    });
  });
});
