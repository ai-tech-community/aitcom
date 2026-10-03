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
        { ...hint("count"), kind: "number", required: false },
        { ...hint("forks"), kind: "checkbox", required: false },
      ],
    });
  });

  it("refuses a schema with a field it cannot draw", () => {
    const schema = z.toJSONSchema(
      z.object({ fields: z.array(z.object({ name: z.string() })) }),
    );
    expect(
      formFieldsFor({ fields: [hint("fields")], inputJsonSchema: schema }),
    ).toEqual({ ok: false, unsupported: ["fields"] });
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
    { ...hint("count"), kind: "number" as const, required: false },
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
