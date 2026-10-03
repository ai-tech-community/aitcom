import { describe, expect, it } from "vitest";
import { z } from "zod";

import { allCollectors } from "@/server/collectors/catalog";
import type { FieldHint } from "@/server/collectors/collector";
import {
  coerceInput,
  type FormField,
  formFieldsFor,
  initialValue,
  newRow,
  type RowValue,
  rowsToSend,
} from "./form-fields";

/** A typed row, as the form holds it. */
const row = (cells: Record<string, string>): RowValue => ({
  ...newRow(),
  cells,
});

const hint = (name: string) => ({
  name,
  label: name,
  help: null,
  placeholder: null,
  columns: null,
});

const column = (name: string) => ({
  name,
  label: name,
  help: null,
  placeholder: null,
});

/** The shape of a list of columns, as the page-list collector asks for it. */
const columnList = z
  .array(
    z.object({
      name: z.string().min(1).max(40),
      selector: z.string().min(1).max(200),
      attribute: z.string().optional(),
    }),
  )
  .min(1)
  .max(20);

const rowsHint = (
  name: string,
  columns = ["name", "selector", "attribute"],
) => ({
  ...hint(name),
  columns: columns.map(column),
});

describe("formFieldsFor", () => {
  it("maps JSON schema properties to field kinds and required flags", () => {
    const schema = z.toJSONSchema(
      z.object({
        url: z.url(),
        name: z.string(),
        count: z.number().int().optional(),
        forks: z.boolean().optional(),
      }),
    );
    const result = formFieldsFor({
      fields: ["url", "name", "count", "forks"].map(hint),
      inputJsonSchema: schema,
    });
    expect(result).toEqual({
      ok: true,
      fields: [
        { ...column("url"), kind: "url", required: true },
        { ...column("name"), kind: "text", required: true },
        { ...column("count"), kind: "number", integer: true, required: false },
        { ...column("forks"), kind: "checkbox", required: false },
      ],
    });
  });

  it("tells whole numbers from decimal numbers", () => {
    const schema = z.toJSONSchema(
      z.object({ pages: z.number().int(), ratio: z.number() }),
    );
    expect(
      formFieldsFor({
        fields: ["pages", "ratio"].map(hint),
        inputJsonSchema: schema,
      }),
    ).toEqual({
      ok: true,
      fields: [
        { ...column("pages"), kind: "number", integer: true, required: true },
        { ...column("ratio"), kind: "number", integer: false, required: true },
      ],
    });
  });

  it("treats a field with a default as optional, even when the schema lists it as required", () => {
    const schema = z.toJSONSchema(
      z.object({ url: z.url(), limit: z.number().int().default(25) }),
    );
    expect(schema).toMatchObject({ required: ["url", "limit"] });
    expect(
      formFieldsFor({
        fields: ["url", "limit"].map(hint),
        inputJsonSchema: schema,
      }),
    ).toEqual({
      ok: true,
      fields: [
        { ...column("url"), kind: "url", required: true },
        { ...column("limit"), kind: "number", integer: true, required: false },
      ],
    });
  });

  it("refuses a schema with a field it cannot draw", () => {
    const schema = z.toJSONSchema(
      z.object({
        url: z.url(),
        tags: z.array(z.string()),
        mode: z.enum(["fast", "deep"]),
        contact: z.email(),
        fixed: z.literal("v1"),
        always: z.literal(true),
      }),
    );
    expect(
      formFieldsFor({
        fields: ["url", "tags", "mode", "contact", "fixed", "always"].map(hint),
        inputJsonSchema: schema,
      }),
    ).toEqual({
      ok: false,
      unsupported: ["tags", "mode", "contact", "fixed", "always"],
    });
  });

  it("draws a list of objects as rows, with columns in hint order", () => {
    const schema = z.toJSONSchema(z.object({ fields: columnList }));
    expect(schema).toMatchObject({
      properties: {
        fields: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { type: "object", required: ["name", "selector"] },
        },
      },
    });
    expect(
      formFieldsFor({
        fields: [rowsHint("fields", ["selector", "name", "attribute"])],
        inputJsonSchema: schema,
      }),
    ).toEqual({
      ok: true,
      fields: [
        {
          ...column("fields"),
          kind: "rows",
          required: true,
          min: 1,
          max: 20,
          columns: [
            { ...column("selector"), kind: "text", required: true },
            { ...column("name"), kind: "text", required: true },
            { ...column("attribute"), kind: "text", required: false },
          ],
        },
      ],
    });
  });

  it("allows up to 20 rows when the schema sets no bounds", () => {
    const schema = z.toJSONSchema(
      z.object({
        links: z.array(z.object({ href: z.url(), weight: z.number() })),
      }),
    );
    const result = formFieldsFor({
      fields: [rowsHint("links", ["href", "weight"])],
      inputJsonSchema: schema,
    });
    expect(result).toMatchObject({
      ok: true,
      fields: [
        {
          kind: "rows",
          min: 0,
          max: 20,
          columns: [
            { name: "href", kind: "url" },
            { name: "weight", kind: "number", integer: false },
          ],
        },
      ],
    });
  });

  it.each([
    [
      "a list without column hints",
      z.object({ fields: columnList }),
      hint("fields"),
    ],
    [
      "nested rows",
      z.object({
        fields: z.array(
          z.object({
            name: z.string(),
            parts: z.array(z.object({ a: z.string() })),
          }),
        ),
      }),
      rowsHint("fields", ["name", "parts"]),
    ],
    [
      "a column it cannot draw",
      z.object({
        fields: z.array(z.object({ name: z.string(), on: z.boolean() })),
      }),
      rowsHint("fields", ["name", "on"]),
    ],
    [
      "a column the schema does not have",
      z.object({ fields: columnList }),
      rowsHint("fields", ["name", "selector", "colour"]),
    ],
  ])("refuses %s", (_case, shape, fieldHint) => {
    expect(
      formFieldsFor({
        fields: [fieldHint],
        inputJsonSchema: z.toJSONSchema(shape),
      }),
    ).toEqual({ ok: false, unsupported: ["fields"] });
  });

  it("lets a page-list column leave its selector empty", () => {
    const pageList = allCollectors().find((c) => c.id === "page-list")!;
    const result = formFieldsFor({
      fields: [
        {
          ...hint("fields"),
          columns: ["name", "selector", "attribute"].map(column),
        },
      ],
      inputJsonSchema: z.toJSONSchema(pageList.inputSchema),
    });
    const rows = result.ok ? result.fields[0] : undefined;
    expect(
      rows?.kind === "rows"
        ? rows.columns.map((c) => [c.name, c.required])
        : null,
    ).toEqual([
      ["name", true],
      ["selector", false],
      ["attribute", false],
    ]);
  });

  it.each(allCollectors().map((c) => [c.id, c] as const))(
    "can draw every field of %s",
    (_id, c) => {
      const fields = Object.entries(
        c.fieldHints as Record<string, FieldHint>,
      ).map(([name, h]) => ({
        ...hint(name),
        columns: h.columns ? Object.keys(h.columns).map(column) : null,
      }));
      expect(
        formFieldsFor({
          fields,
          inputJsonSchema: z.toJSONSchema(c.inputSchema),
        }).ok,
      ).toBe(true);
    },
  );
});

describe("coerceInput", () => {
  const fields: FormField[] = [
    { ...column("url"), kind: "url", required: true },
    { ...column("count"), kind: "number", integer: true, required: false },
    { ...column("forks"), kind: "checkbox", required: false },
  ];

  it("trims text, turns numbers into numbers and leaves out empty optional fields", () => {
    expect(
      coerceInput(fields, {
        url: "  https://e.com/f  ",
        count: "",
        forks: true,
      }),
    ).toEqual({ url: "https://e.com/f", forks: true });
    expect(
      coerceInput(fields, {
        url: "https://e.com/f",
        count: "25",
        forks: false,
      }),
    ).toEqual({ url: "https://e.com/f", count: 25, forks: false });
  });

  const rows: FormField = {
    ...column("fields"),
    kind: "rows",
    required: true,
    min: 1,
    max: 20,
    columns: [
      { ...column("name"), kind: "text", required: true },
      { ...column("selector"), kind: "text", required: true },
      { ...column("attribute"), kind: "text", required: false },
      { ...column("weight"), kind: "number", integer: false, required: false },
    ],
  };

  it("turns rows into objects: trimmed cells, no empty optional cells, no empty rows", () => {
    expect(
      coerceInput([rows], {
        fields: [
          row({ name: " title ", selector: " h3 a ", attribute: "  " }),
          row({ name: "", selector: "", attribute: "", weight: " " }),
          row({
            name: "link",
            selector: "h3 a",
            attribute: "href",
            weight: "2.5",
          }),
          row({}),
        ],
      }),
    ).toEqual({
      fields: [
        { name: "title", selector: "h3 a" },
        { name: "link", selector: "h3 a", attribute: "href", weight: 2.5 },
      ],
    });
  });

  it("keeps an empty required cell so the server can point at it", () => {
    expect(coerceInput([rows], { fields: [row({ name: "title" })] })).toEqual({
      fields: [{ name: "title", selector: "" }],
    });
  });

  it("sends an empty list for required rows the member never filled", () => {
    expect(coerceInput([rows], {})).toEqual({ fields: [] });
    expect(coerceInput([{ ...rows, required: false }], {})).toEqual({});
  });

  it("sends exactly the rows rowsToSend names, in order", () => {
    const kept = row({ name: "title" });
    const value = [row({}), kept, row({ name: " " }), row({ attribute: "x" })];
    expect(rowsToSend(rows, value).map((r) => r.id)).toEqual([
      kept.id,
      value[3]!.id,
    ]);
    expect(coerceInput([rows], { fields: value })).toEqual({
      fields: [
        { name: "title", selector: "" },
        { name: "", selector: "", attribute: "x" },
      ],
    });
  });
});

describe("rows", () => {
  it("gives every new row its own id", () => {
    const ids = [newRow(), newRow(), newRow()].map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("starts a rows field with its minimum number of empty rows, at least one", () => {
    const field: FormField = {
      ...column("fields"),
      kind: "rows",
      required: true,
      min: 2,
      max: 5,
      columns: [{ ...column("name"), kind: "text", required: true }],
    };
    const value = initialValue(field) as RowValue[];
    expect(value.map((r) => r.cells)).toEqual([{}, {}]);
    expect(new Set(value.map((r) => r.id)).size).toBe(2);
    expect(
      (initialValue({ ...field, min: 0 }) as RowValue[]).map((r) => r.cells),
    ).toEqual([{}]);
  });
});
