import { SaxesParser } from "saxes";
import { ExtractError, type ExtractResult } from "./protocol";

export const MAX_XML_CHARS = 5 * 1024 * 1024;
export const MAX_XML_DEPTH = 128;
export const MAX_XML_ELEMENTS = 100_000;
export const MAX_XML_OUTPUT_CHARS = 8 * 1024 * 1024;

type Fields = Record<string, unknown>;
type Frame = { name: string; fields: Fields; text: string[] };
const fields = (): Fields => Object.create(null) as Fields;

/** Strict XML decoding inside the existing deadline/heap-bound worker. */
export function extractXml(xml: string): ExtractResult {
  if (xml.length > MAX_XML_CHARS) throw new ExtractError("page_too_complex");
  let document: unknown;
  try {
    document = parseDocument(xml);
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    document = null;
  }
  const json = JSON.stringify(document);
  if (json.length > MAX_XML_OUTPUT_CHARS)
    throw new ExtractError("page_too_complex");
  return {
    rows: [{ json }],
    nextUrl: null,
    nextUrlTooLong: false,
    truncated: false,
  };
}

/** SAX events bound construction and preserve CDATA/reference decoding order. */
function parseDocument(xml: string): Fields {
  const document = fields();
  const stack: Frame[] = [];
  let elements = 0;
  const parser = new SaxesParser({
    xmlns: false,
    defaultXMLVersion: "1.0",
    forceXMLVersion: true,
  });
  parser.on("doctype", () => {
    throw new Error("DTD declarations are not allowed");
  });
  parser.on("opentag", (tag) => {
    if (++elements > MAX_XML_ELEMENTS)
      throw new ExtractError("page_too_complex");
    if (stack.length + 1 > MAX_XML_DEPTH)
      throw new ExtractError("page_too_deep");
    const frame: Frame = { name: tag.name, fields: fields(), text: [] };
    for (const [name, value] of Object.entries(tag.attributes))
      frame.fields[`@_${name}`] = value;
    stack.push(frame);
  });
  const appendText = (text: string) => {
    stack.at(-1)?.text.push(text);
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => {
    const frame = stack.pop()!;
    const text = frame.text.join("");
    const hasFields = Object.keys(frame.fields).length > 0;
    if (hasFields && text) frame.fields["#text"] = text;
    const value = hasFields ? frame.fields : text;
    const parent = stack.at(-1)?.fields ?? document;
    if (!Object.hasOwn(parent, frame.name)) parent[frame.name] = value;
    else {
      const previous = parent[frame.name];
      if (Array.isArray(previous)) previous.push(value);
      else parent[frame.name] = [previous, value];
    }
  });
  // Saxes throws on malformed XML, undeclared entities and invalid characters.
  // It never fetches external entities; the doctype handler refuses DTDs entirely.
  parser.write(xml).close();
  return document;
}
