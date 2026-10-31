import { describe, expect, it } from "vitest";
import {
  extractXml,
  MAX_XML_CHARS,
  MAX_XML_DEPTH,
  MAX_XML_ELEMENTS,
  MAX_XML_OUTPUT_CHARS,
} from "./extract-xml";
import { ExtractError } from "./protocol";

const parse = (xml: string): unknown =>
  JSON.parse(extractXml(xml).rows[0]!.json!);
describe("bounded XML extraction", () => {
  it("preserves CDATA markup, string IDs and built-in XML entities", () => {
    expect(
      parse(
        '<?xml version="1.0"?><root><id>9007199254740993</id><title>R&amp;D</title><body><![CDATA[<p>Build &amp; learn</p>]]></body></root>',
      ),
    ).toEqual({
      root: {
        id: "9007199254740993",
        title: "R&D",
        body: "<p>Build &amp; learn</p>",
      },
    });
  });
  it.each([
    "",
    "<root>",
    "<r><x></r>",
    "<r/><other/>",
    "before<r/>",
    "<r/>after",
    "<![CDATA[text]]><r/>",
    "<r bool/>",
    "<r>\0</r>",
    '<!DOCTYPE r SYSTEM "https://example.com/private"><r/>',
    '<!DOCTYPE r [<!ENTITY a "boom">]><r>&a;</r>',
  ])("refuses malformed or declared-entity XML %s", (xml) =>
    expect(parse(xml)).toBeNull(),
  );
  it.each([
    "<r>&undefined;</r>",
    "<r>&nbsp;</r>",
    '<r a="&bogus;"/>',
    "<r>&#0;</r>",
    "<r>&#xD800;</r>",
    "<r>&#x110000;</r>",
    "<r><!-- invalid -- comment --></r>",
    "<r><!--invalid---></r>",
    '<r a="raw < text"/>',
    "<r>text]]></r>",
  ])("refuses invalid references and XML syntax %s", (xml) =>
    expect(parse(xml)).toBeNull(),
  );

  it("allows literal references in CDATA/comments and valid numeric Unicode references", () => {
    expect(
      parse(
        "<r><!-- &undefined; --><value><![CDATA[&undefined; &#0;]]></value><emoji>&#x1F600;</emoji></r>",
      ),
    ).toEqual({ r: { value: "&undefined; &#0;", emoji: "😀" } });
  });

  it("decodes references exactly once with XML character semantics", () => {
    expect(
      parse(
        "<r><a>&#38;amp;</a><b>&#38;#x41;</b><c>&#38;#38;</c><space>&#160;</space><letter>&#0000000065;</letter><body><![CDATA[&#38;amp;]]></body></r>",
      ),
    ).toEqual({
      r: {
        a: "&amp;",
        b: "&#x41;",
        c: "&#38;",
        space: "\u00a0",
        letter: "A",
        body: "&#38;amp;",
      },
    });
  });

  it("skips comments and CDATA during depth counting and respects quoted greater-than signs", () => {
    const deep = "<x>".repeat(MAX_XML_DEPTH + 1);
    expect(
      parse(
        `<r attr=">"> <!--${deep}--><value><![CDATA[${deep}]]></value></r>`,
      ),
    ).toEqual({ r: { value: deep, "@_attr": ">", "#text": " " } });
  });
  it("enforces element nesting including self-closing elements", () => {
    expect(() =>
      extractXml(
        `${"<r>".repeat(MAX_XML_DEPTH)}<x/>${"</r>".repeat(MAX_XML_DEPTH)}`,
      ),
    ).toThrowError(ExtractError);
    expect(() =>
      extractXml(
        `${"<r>".repeat(MAX_XML_DEPTH)}${"</r>".repeat(MAX_XML_DEPTH)}`,
      ),
    ).not.toThrow();
  });
  it("bounds input, element count and serialized output independently", () => {
    expect(() => extractXml(" ".repeat(MAX_XML_CHARS + 1))).toThrowError(
      ExtractError,
    );
    expect(() =>
      extractXml(`<r>${"<x/>".repeat(MAX_XML_ELEMENTS)}</r>`),
    ).toThrowError(ExtractError);
    const wideText = `<r>${"\\".repeat(MAX_XML_OUTPUT_CHARS / 2 + 1)}</r>`;
    expect(wideText.length).toBeLessThan(MAX_XML_CHARS);
    expect(() => extractXml(wideText)).toThrowError(ExtractError);
  });
});
