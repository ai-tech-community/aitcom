import { describe, expect, it } from "vitest";

import { newsRumorErrorText } from "./rumor-error";

const copy = {
  rate: "Too many",
  url: "Bad link",
  title: "Short title",
  body: "Short note",
  invalid: "Check the form",
};

describe("newsRumorErrorText", () => {
  it("names the rate limit, the link, and the short fields", () => {
    expect(newsRumorErrorText("rate", {}, copy)).toBe("Too many");
    expect(newsRumorErrorText("url", {}, copy)).toBe("Bad link");
    expect(newsRumorErrorText("oops", { url: "url" }, copy)).toBe("Bad link");
    expect(newsRumorErrorText("oops", { title: "too small" }, copy)).toBe(
      "Short title",
    );
    expect(newsRumorErrorText("oops", { body: "too small" }, copy)).toBe(
      "Short note",
    );
    expect(newsRumorErrorText("oops", {}, copy)).toBe("Check the form");
  });
});
