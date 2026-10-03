import { describe, expect, it } from "vitest";
import { checkSelector } from "./selector-policy";

describe("checkSelector", () => {
  it.each([
    "li",
    "*",
    ".talk",
    "#speakers",
    "ul.list > li.item",
    "h2 + p",
    "h2 ~ p",
    "a[href]",
    'a[href^="https://"]',
    "[data-id='3']",
    "li:not(.ad)",
    "li:is(.a, .b)",
    ":where(article) h2",
    "tr:first-child",
    "tr:last-child td:only-child",
    "td:first-of-type",
    "td:last-of-type",
    "p:only-of-type",
    "div:empty",
    "div p span a b i em strong",
  ])("allows %s", (selector) => {
    expect(checkSelector(selector)).toEqual({ ok: true });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["a".repeat(201), "too_long"],
    ["li,", "invalid"],
    ["li[", "invalid"],
    ["a, b", "list"],
    ["li:nth-child(2n)", "not_allowed"],
    ["li:nth-of-type(2)", "not_allowed"],
    ["li:nth-last-child(1)", "not_allowed"],
    ["li:nth-last-of-type(1)", "not_allowed"],
    ["div:has(p)", "not_allowed"],
    ["a:contains(x)", "not_allowed"],
    ["a:icontains(x)", "not_allowed"],
    ["li:eq(2)", "not_allowed"],
    ["li:gt(1)", "not_allowed"],
    ["p::before", "not_allowed"],
    ["li:not(:nth-child(2))", "not_allowed"],
    ["a b c d e f g h i", "too_complex"],
  ] as const)("refuses %j (%s)", (selector, reason) => {
    expect(checkSelector(selector)).toEqual({ ok: false, reason });
  });

  it.each([
    ["li < a", "not_allowed"],
    ["col || td", "not_allowed"],
    ["li:lt(1)", "not_allowed"],
    ["a:link", "not_allowed"],
    ["li:empty(x)", "not_allowed"],
    ["li:not(a b c d e f g h i)", "too_complex"],
    ["li:is(.a, a b c d e f g h i)", "too_complex"],
  ] as const)("also refuses %j (%s)", (selector, reason) => {
    expect(checkSelector(selector)).toEqual({ ok: false, reason });
  });

  it("allows exactly MAX_SELECTOR_LENGTH characters", () => {
    expect(checkSelector("a".repeat(200))).toEqual({ ok: true });
  });

  it.each(["a ~ b", "li:is(a ~ b)", ":NOT(.a)", "li:IS(a)"])(
    "allows %s (fix round 1)",
    (selector) => {
      expect(checkSelector(selector)).toEqual({ ok: true });
    },
  );

  it.each([
    ["a ~ b ~ c", "too_complex"],
    ["p:not(a ~ b) ~ c", "too_complex"],
    ["li:is(a ~ b, c ~ d)", "too_complex"],
    ["svg|rect", "not_allowed"],
    ["*|rect", "not_allowed"],
    ["|rect", "not_allowed"],
    ["[xlink|href]", "not_allowed"],
    ["[*|href]", "not_allowed"],
    ["li:not(svg|rect)", "not_allowed"],
    [":NTH-CHILD(2)", "not_allowed"],
  ] as const)("refuses %j (%s) (fix round 1)", (selector, reason) => {
    expect(checkSelector(selector)).toEqual({ ok: false, reason });
  });

  it.each(["li:first-of-type:last-of-type", "li:first-child ~ li"])(
    "allows %s (fix round 2)",
    (selector) => {
      expect(checkSelector(selector)).toEqual({ ok: true });
    },
  );

  it.each([
    ":not(:only-of-type) ~ *",
    ":not(:first-of-type) ~ *",
    "a ~ b:last-child",
    "li:only-of-type:only-child:last-child",
    "li:is(:only-of-type, :last-of-type):not(:only-child)",
  ])("refuses %j as too_complex (fix round 2)", (selector) => {
    expect(checkSelector(selector)).toEqual({
      ok: false,
      reason: "too_complex",
    });
  });
});
