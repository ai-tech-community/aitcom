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
    "a[href]",
    'a[href^="https://"]',
    "[data-id='3']",
    "li:not(.ad)",
    "li:is(.a, .b)",
    ":where(article) h2",
    "tr:first-child",
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
    // Round 3: combinators inside :not/:is/:where are refused outright.
    ["li:not(a b c d e f g h i)", "not_allowed"],
    ["li:is(.a, a b c d e f g h i)", "not_allowed"],
  ] as const)("also refuses %j (%s)", (selector, reason) => {
    expect(checkSelector(selector)).toEqual({ ok: false, reason });
  });

  it("allows exactly MAX_SELECTOR_LENGTH characters", () => {
    expect(checkSelector("a".repeat(200))).toEqual({ ok: true });
  });

  it.each([":NOT(.a)", "li:IS(a)"])("allows %s (fix round 1)", (selector) => {
    expect(checkSelector(selector)).toEqual({ ok: true });
  });

  it.each([
    // Round 3: any combinator inside :not/:is/:where is not_allowed.
    ["p:not(a ~ b) ~ c", "not_allowed"],
    ["li:is(a ~ b, c ~ d)", "not_allowed"],
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

  it.each([
    "li:not(.ad)",
    "li:is(.a, .b)",
    ":where(article, section)",
    "li:not([hidden])",
    "li:not(a.ad[hidden]:first-child)",
  ])("allows %s (fix round 3)", (selector) => {
    expect(checkSelector(selector)).toEqual({ ok: true });
  });

  it.each([
    ":not(a div)",
    ":is(a > b)",
    "li:where(a + b)",
    "p:not(a ~ b)",
    "li:is(a ~ b)",
    "li:is(.a, .b .c)",
    "li:not(:is(a b))",
  ])("refuses %j as not_allowed (fix round 3)", (selector) => {
    expect(checkSelector(selector)).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });

  // Round 4: the general sibling combinator `~` is refused everywhere.
  it.each([
    "a ~ b",
    "h2 ~ p",
    "a ~ b ~ c",
    "li:first-child ~ li",
    ":not(:only-of-type) ~ *",
    ":not(:first-of-type) ~ *",
    "a ~ b:last-child",
    "section * ~ *",
    "p * * * * * * ~ *",
    "a ~ b c d e f g h i",
  ])("refuses %j as not_allowed (fix round 4)", (selector) => {
    expect(checkSelector(selector)).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });

  it.each(["h2 + p", "a + b + c + d + e + f + g + h", "li:first-child + li"])(
    "allows %s (fix round 4)",
    (selector) => {
      expect(checkSelector(selector)).toEqual({ ok: true });
    },
  );

  it("refuses eight `+` in a row as too_complex (fix round 4)", () => {
    expect(checkSelector("a + b + c + d + e + f + g + h + i")).toEqual({
      ok: false,
      reason: "too_complex",
    });
  });

  // Round 5: sibling-scanning pseudo-classes are refused everywhere.
  it.each([
    "td:first-of-type",
    "td:last-of-type",
    "p:only-of-type",
    "tr:last-child",
    "li:only-child",
    "li:not(:last-child)",
    "tr:last-child td:only-child",
    "li:first-of-type:last-of-type",
    "li:only-of-type:only-child:last-child",
    "li:is(:only-of-type, :last-of-type):not(:only-child)",
    "li:first-of-type + li:last-of-type",
    "li:only-of-type + li:last-child + li:only-child",
    "* + :only-of-type *",
    "li:where(.a:last-of-type)",
    "LI:LAST-CHILD",
  ])("refuses %j as not_allowed (fix round 5)", (selector) => {
    expect(checkSelector(selector)).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });

  it.each([
    "tr:first-child",
    "div:empty",
    "li:not(:first-child)",
    "li:first-child + li + li",
    "li:is(:first-child, :empty)",
  ])("allows %s (fix round 5)", (selector) => {
    expect(checkSelector(selector)).toEqual({ ok: true });
  });
});
