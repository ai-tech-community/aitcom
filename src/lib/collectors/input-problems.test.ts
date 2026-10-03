import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type FormField, newRow, type RowValue } from "./form-fields";
import {
  DUPLICATE_NAME,
  inputProblemsOf,
  placeProblems,
  problemCopy,
  problemIssue,
  selectorRefused,
} from "./input-problems";
import { MAX_COMPOUNDS, MAX_SELECTOR_LENGTH } from "./selector-policy";

describe("inputProblemsOf", () => {
  it("keys each problem by its full path, with the check's own code", () => {
    const schema = z.object({
      url: z.url(),
      fields: z
        .array(
          z.object({
            name: z.string(),
            selector: z.string().superRefine((value, ctx) => {
              if (value === "a ~ b") {
                ctx.addIssue(problemIssue(selectorRefused("not_allowed")));
              }
            }),
          }),
        )
        .min(1),
    });
    const result = schema.safeParse({
      url: "nope",
      fields: [
        { name: "ok", selector: "a" },
        { name: "bad", selector: "a ~ b" },
      ],
    });
    expect(inputProblemsOf(result.error!.issues)).toEqual({
      url: ["invalid_format"],
      "fields.1.selector": ["selector_not_allowed/not_allowed"],
    });
  });

  it("reports a problem with no path under the empty key", () => {
    const result = z
      .object({ a: z.string() })
      .superRefine((_value, ctx) => ctx.addIssue(problemIssue("whole_input")))
      .safeParse({ a: "x" });
    expect(inputProblemsOf(result.error!.issues)).toEqual({
      "": ["whole_input"],
    });
  });

  it("never passes a check's English message on", () => {
    const result = z
      .object({ a: z.string().min(3, "Too short, friend.") })
      .safeParse({ a: "x" });
    expect(JSON.stringify(inputProblemsOf(result.error!.issues))).not.toContain(
      "friend",
    );
  });
});

const columns: FormField = {
  name: "fields",
  label: "Columns",
  help: null,
  placeholder: null,
  kind: "rows",
  required: true,
  min: 1,
  max: 20,
  columns: [
    {
      name: "name",
      label: "Name",
      help: null,
      placeholder: null,
      kind: "text",
      required: true,
    },
    {
      name: "selector",
      label: "Selector",
      help: null,
      placeholder: null,
      kind: "text",
      required: false,
    },
  ],
};

const itemSelector: FormField = {
  name: "itemSelector",
  label: "Item selector",
  help: null,
  placeholder: null,
  kind: "text",
  required: true,
};

const row = (cells: Record<string, string>): RowValue => ({
  ...newRow(),
  cells,
});

describe("placeProblems", () => {
  it("puts a column problem on the row the member typed it in", () => {
    // The empty first row is not sent, so the server's row 1 is the third.
    const rows = [row({}), row({ name: "a" }), row({ name: "b" })];
    const placed = placeProblems(
      [itemSelector, columns],
      { fields: rows },
      {
        itemSelector: ["selector_not_allowed/list"],
        "fields.1.selector": ["selector_not_allowed/too_long"],
        "fields.1.name": [DUPLICATE_NAME],
      },
    );
    expect(placed).toEqual({
      fields: { itemSelector: ["selector_not_allowed/list"] },
      cells: {
        fields: {
          [rows[2]!.id]: {
            selector: ["selector_not_allowed/too_long"],
            name: [DUPLICATE_NAME],
          },
        },
      },
    });
  });

  it("puts a problem without a precise row and column on the whole field", () => {
    const rows = [row({ name: "a" })];
    const placed = placeProblems(
      [columns],
      { fields: rows },
      {
        fields: ["too_small"],
        "fields.0": ["invalid_type"],
        "fields.5.selector": ["selector_not_allowed/empty"],
        "fields.0.colour": ["invalid_type"],
      },
    );
    expect(placed).toEqual({
      fields: {
        fields: [
          "too_small",
          "invalid_type",
          "selector_not_allowed/empty",
          "invalid_type",
        ],
      },
      cells: {},
    });
  });

  it("leaves out problems for fields the form does not draw", () => {
    expect(
      placeProblems([itemSelector], {}, { "": ["x"], other: ["y"] }),
    ).toEqual({ fields: {}, cells: {} });
  });
});

describe("problemCopy", () => {
  it.each([
    ["selector_not_allowed/empty", "start.problem.selector.empty", undefined],
    [
      "selector_not_allowed/too_long",
      "start.problem.selector.too_long",
      { max: MAX_SELECTOR_LENGTH },
    ],
    [
      "selector_not_allowed/invalid",
      "start.problem.selector.invalid",
      undefined,
    ],
    ["selector_not_allowed/list", "start.problem.selector.list", undefined],
    [
      "selector_not_allowed/too_complex",
      "start.problem.selector.too_complex",
      { max: MAX_COMPOUNDS },
    ],
    [
      "selector_not_allowed/not_allowed",
      "start.problem.selector.not_allowed",
      undefined,
    ],
    [DUPLICATE_NAME, "start.problem.duplicate_name", undefined],
  ])("words %s", (code, key, values) => {
    expect(problemCopy(code)).toEqual({ key, values });
  });

  it.each(["invalid_format", "selector_not_allowed/teleport", "", "x/y"])(
    "has no special words for %j, so the field's own note shows",
    (code) => {
      expect(problemCopy(code)).toBeNull();
    },
  );
});
