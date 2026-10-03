import { describe, expect, it } from "vitest";
import { z } from "zod";

import { allCollectors } from "@/server/collectors/catalog";
import { coerceInput, formFieldsFor } from "./form-fields";

const hint = (name: string) => ({
  name,
  label: name,
  help: null,
  placeholder: null,
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
        { ...hint("url"), kind: "url", required: true },
        { ...hint("name"), kind: "text", required: true },
        { ...hint("count"), kind: "number", integer: true, required: false },
        { ...hint("forks"), kind: "checkbox", required: false },
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
        { ...hint("pages"), kind: "number", integer: true, required: true },
        { ...hint("ratio"), kind: "number", integer: false, required: true },
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
        { ...hint("url"), kind: "url", required: true },
        { ...hint("limit"), kind: "number", integer: true, required: false },
      ],
    });
  });

  it("refuses a schema with a field it cannot draw", () => {
    const schema = z.toJSONSchema(
      z.object({
        url: z.url(),
        fields: z.array(z.object({ name: z.string() })),
        mode: z.enum(["fast", "deep"]),
        contact: z.email(),
        fixed: z.literal("v1"),
      }),
    );
    expect(
      formFieldsFor({
        fields: ["url", "fields", "mode", "contact", "fixed"].map(hint),
        inputJsonSchema: schema,
      }),
    ).toEqual({
      ok: false,
      unsupported: ["fields", "mode", "contact", "fixed"],
    });
  });

  it.each(allCollectors().map((c) => [c.id, c] as const))(
    "can draw every field of %s",
    (_id, c) => {
      const fields = Object.keys(c.fieldHints).map(hint);
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
  const fields = [
    { ...hint("url"), kind: "url" as const, required: true },
    {
      ...hint("count"),
      kind: "number" as const,
      integer: true,
      required: false,
    },
    { ...hint("forks"), kind: "checkbox" as const, required: false },
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
});
