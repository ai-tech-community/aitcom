import { describe, expect, it } from "vitest";

import type { FormField } from "./form-fields";
import {
  formValueOf,
  hasProblemIn,
  presetInitialValues,
  splitFields,
} from "./preset-form";

const base = { help: null, placeholder: null, required: false } as const;
const url: FormField = {
  ...base,
  name: "url",
  label: "Page address",
  kind: "url",
  required: true,
};
const item: FormField = {
  ...base,
  name: "itemSelector",
  label: "Item selector",
  kind: "text",
};
const pages: FormField = {
  ...base,
  name: "maxPages",
  label: "Pages",
  kind: "number",
  integer: true,
};
const strict: FormField = {
  ...base,
  name: "strict",
  label: "Strict",
  kind: "checkbox",
};
const columns: FormField = {
  ...base,
  name: "fields",
  label: "Columns",
  kind: "rows",
  min: 1,
  max: 20,
  columns: [
    { ...base, name: "name", label: "Name", kind: "text", required: true },
    { ...base, name: "selector", label: "Selector", kind: "text" },
  ],
};
const all = [url, item, columns, pages, strict];

describe("splitFields", () => {
  it("asks the preset's fields in its order and keeps the rest, in form order, as settings", () => {
    const { asked, settings } = splitFields(all, ["itemSelector", "url"]);
    expect(asked.map((f) => f.name)).toEqual(["itemSelector", "url"]);
    expect(settings.map((f) => f.name)).toEqual([
      "fields",
      "maxPages",
      "strict",
    ]);
  });
  it("ignores asked names the form does not have", () => {
    expect(splitFields([url], ["url", "ghost"]).asked).toEqual([url]);
  });
});

describe("formValueOf", () => {
  it("turns stored values into what each field holds", () => {
    expect(formValueOf(url, "https://example.com")).toBe("https://example.com");
    expect(formValueOf(pages, 2)).toBe("2");
    expect(formValueOf(strict, true)).toBe(true);
    expect(formValueOf(strict, "true")).toBe(true);
    expect(formValueOf(strict, "false")).toBe(false);
    const rows = formValueOf(columns, [
      { name: "title", selector: "h3" },
      { name: "link" },
    ]);
    expect(Array.isArray(rows) && rows.map((r) => r.cells)).toEqual([
      { name: "title", selector: "h3" },
      { name: "link" },
    ]);
  });
  it("starts a field empty when the value does not fit it", () => {
    expect(formValueOf(url, { a: 1 })).toBe("");
    expect(formValueOf(pages, null)).toBe("");
    const rows = formValueOf(columns, "title");
    expect(Array.isArray(rows) && rows.length).toBe(1);
  });
});

describe("presetInitialValues", () => {
  it("prefers the pasted value, then the preset's base, then empty", () => {
    const values = presetInitialValues(
      all,
      { url: "https://base.example/", itemSelector: "li.job", maxPages: 2 },
      { url: "https://pasted.example/jobs", bogus: "x" },
    );
    expect(values.url).toBe("https://pasted.example/jobs");
    expect(values.itemSelector).toBe("li.job");
    expect(values.maxPages).toBe("2");
    expect(values.strict).toBe(false);
    expect(values).not.toHaveProperty("bogus");
  });
  it("ignores inherited names", () => {
    expect(presetInitialValues([url], {}, {}).url).toBe("");
  });
});

describe("hasProblemIn", () => {
  it("sees a problem under a field or at one of its cells", () => {
    expect(
      hasProblemIn([item], { fields: { itemSelector: ["x"] }, cells: {} }),
    ).toBe(true);
    expect(
      hasProblemIn([columns], {
        fields: {},
        cells: { fields: { "row-1": { name: ["x"] } } },
      }),
    ).toBe(true);
    expect(hasProblemIn([pages], { fields: { url: ["x"] }, cells: {} })).toBe(
      false,
    );
  });
});
