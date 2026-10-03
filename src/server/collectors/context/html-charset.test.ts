// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decodeHtml, htmlEncoding } from "./html-charset";

/** "Café – €5" in windows-1252: é is 0xE9, the en dash 0x96, € is 0x80. */
const CAFE_1252 = [0x43, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x80, 0x35];

function bytes(...parts: (string | number[])[]): Buffer {
  return Buffer.concat(
    parts.map((part) =>
      typeof part === "string"
        ? Buffer.from(part, "latin1")
        : Buffer.from(part),
    ),
  );
}

describe("htmlEncoding", () => {
  it("uses the charset in the Content-Type header", () => {
    expect(
      htmlEncoding(bytes("<p>x</p>"), "text/html; charset=ISO-8859-1"),
    ).toBe("windows-1252");
  });

  it("reads a quoted header charset", () => {
    expect(htmlEncoding(bytes(""), 'text/html; charset="windows-1252"')).toBe(
      "windows-1252",
    );
  });

  it("falls back to <meta charset> when the header has none", () => {
    const body = bytes('<html><head><meta charset="windows-1252"><title>');
    expect(htmlEncoding(body, "text/html")).toBe("windows-1252");
  });

  it("reads a <meta http-equiv> declaration", () => {
    const body = bytes(
      `<head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-2">`,
    );
    expect(htmlEncoding(body, null)).toBe("iso-8859-2");
  });

  it("lets the header win over <meta>", () => {
    const body = bytes('<meta charset="windows-1252">');
    expect(htmlEncoding(body, "text/html; charset=utf-8")).toBe("utf-8");
  });

  it("only looks at the first 1024 bytes for <meta>", () => {
    const body = bytes(" ".repeat(1_024), '<meta charset="windows-1252">');
    expect(htmlEncoding(body, null)).toBe("utf-8");
  });

  it("uses UTF-8 when nothing is declared", () => {
    expect(htmlEncoding(bytes("<p>x</p>"), null)).toBe("utf-8");
  });

  it("uses UTF-8 for a label it does not know", () => {
    expect(htmlEncoding(bytes(""), "text/html; charset=klingon")).toBe("utf-8");
    expect(htmlEncoding(bytes('<meta charset="no-such-thing">'), null)).toBe(
      "utf-8",
    );
  });

  it("reads a <meta> that declares UTF-16 as UTF-8, as browsers do", () => {
    expect(htmlEncoding(bytes('<meta charset="utf-16">'), null)).toBe("utf-8");
  });

  it("lets a byte order mark win over any declaration", () => {
    const body = bytes([0xef, 0xbb, 0xbf], '<meta charset="windows-1252">');
    expect(htmlEncoding(body, "text/html; charset=windows-1252")).toBe("utf-8");
  });
});

describe("decodeHtml", () => {
  it("decodes a windows-1252 page declared in the header", () => {
    expect(
      decodeHtml(bytes(CAFE_1252), "text/html; charset=windows-1252"),
    ).toBe("Café – €5");
  });

  it("decodes a windows-1252 page declared only in <meta>", () => {
    const body = bytes('<meta charset="windows-1252"><p>', CAFE_1252);
    expect(decodeHtml(body, "text/html")).toBe(
      '<meta charset="windows-1252"><p>Café – €5',
    );
  });

  it("decodes UTF-8 by default and drops its byte order mark", () => {
    const body = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Café", "utf8"),
    ]);
    expect(decodeHtml(body, null)).toBe("Café");
  });

  it("keeps the five bytes windows-1252 leaves undefined as they are", () => {
    expect(
      decodeHtml(
        bytes([0x81, 0x8d, 0x8f, 0x90, 0x9d]),
        "text/html; charset=windows-1252",
      ),
    ).toBe("\u0081\u008d\u008f\u0090\u009d");
  });

  it("decodes curly quotes from windows-1252", () => {
    expect(
      decodeHtml(
        bytes([0x93, 0x68, 0x69, 0x94, 0x92]),
        "text/html; charset=windows-1252",
      ),
    ).toBe("“hi”’");
  });
});
