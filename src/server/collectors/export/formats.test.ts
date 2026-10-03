import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, csvCell } from "./formats";

async function* rows(...items: Record<string, unknown>[]) {
  yield* items;
}
async function text(chunks: AsyncIterable<string>) {
  let out = "";
  for await (const c of chunks) out += c;
  return out;
}

describe("csvCell", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    [42, "42"],
    [true, "true"],
    ["plain", "plain"],
    ['say "hi", ok', '"say ""hi"", ok"'],
    ["line\nbreak", '"line\nbreak"'],
    [{ a: 1 }, '"{""a"":1}"'],
  ])("%j → %s", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each([
    ["=SUM(A1)", "'=SUM(A1)"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["-5", "'-5"],
    ["@cmd", "'@cmd"],
    ["\tx", "'\tx"],
    ["\rx", `"'\rx"`],
    ["=1,2", `"'=1,2"`],
  ])("neutralises spreadsheet formulas in text: %j → %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each([
    [-5, "-5"],
    [-0.25, "-0.25"],
  ])(
    "leaves numbers alone, they cannot carry a formula: %j",
    (value, expected) => {
      expect(csvCell(value)).toBe(expected);
    },
  );
});

describe("CSV export", () => {
  it("writes a header from the columns and one line per row", async () => {
    const out = await text(
      EXPORT_FORMATS.csv.write(rows({ b: 2, a: 1 }, { a: 3 }), ["a", "b"]),
    );
    expect(out).toBe("a,b\r\n1,2\r\n3,\r\n");
  });

  it("takes columns from the first row when none are given", async () => {
    const out = await text(EXPORT_FORMATS.csv.write(rows({ x: 1 }), null));
    expect(out).toBe("x\r\n1\r\n");
  });

  it("writes only a header for an empty dataset", async () => {
    expect(await text(EXPORT_FORMATS.csv.write(rows(), ["a"]))).toBe("a\r\n");
  });
});

describe("JSON export", () => {
  it("writes a valid JSON array", async () => {
    const out = await text(
      EXPORT_FORMATS.json.write(rows({ a: 1 }, { a: 2 }), null),
    );
    expect(JSON.parse(out)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("writes [] for an empty dataset", async () => {
    expect(
      JSON.parse(await text(EXPORT_FORMATS.json.write(rows(), null))),
    ).toEqual([]);
  });
});
