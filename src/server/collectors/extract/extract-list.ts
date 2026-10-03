import { load, type Cheerio, type CheerioAPI } from "cheerio";
import { checkSelector } from "../../../lib/collectors/selector-policy";
import {
  ExtractError,
  MAX_CELL_CHARS,
  MAX_DEPTH,
  MAX_OUTPUT_CHARS_PER_PAGE,
  MAX_ROWS_PER_PAGE,
  type ExtractField,
  type ExtractResult,
  type ExtractSpec,
} from "./protocol";

/*
 * Pure "list on a web page" extraction: HTML + spec in, rows + next-page URL
 * out. Runs inside the sandboxed worker, so it imports nothing Node-only or
 * Next-only of its own (relative imports only, so the worker bundle needs no
 * path aliases).
 *
 * Tree walks are iterative (explicit stacks). The depth cap is the only bound
 * on nesting, so nothing here may recurse over the tree.
 */

// Node types, taken from cheerio's own signatures so we do not import
// domhandler (not a direct dependency).
type DocumentNode = ReturnType<CheerioAPI["root"]>[number];
type TreeNode = DocumentNode | DocumentNode["children"][number];
type ElementNode = ReturnType<Cheerio<TreeNode>["children"]>[number];
type Row = Record<string, string | null>;

/** Attributes whose value is a link; resolved and kept only when http(s). */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src", "action"]);

/** Elements whose content is code or inert markup, never visible text. */
const NON_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "noscript",
  "template",
]);

/** Characters of one text value scanned per step. */
const SCAN_CHUNK_CHARS = 4_096;

export function extractList(html: string, spec: ExtractSpec): ExtractResult {
  assertSelectorsAllowed(spec);
  const baseUrl = parseBaseUrl(spec.baseUrl);

  const $ = load(html);
  const document = $.root()[0];
  if (document === undefined) {
    throw new ExtractError("extract_failed", "page did not parse");
  }
  assertDepthWithin(document, MAX_DEPTH);

  const rows: Row[] = [];
  let outputChars = 0;
  let truncated = false;
  // `root().find()`, not `$(selector)`: `$()` would treat a string starting
  // with "<" as HTML to build, not as a selector.
  const items = $.root().find(spec.itemSelector);
  const itemCount = Math.min(items.length, MAX_ROWS_PER_PAGE);
  for (let index = 0; index < itemCount; index += 1) {
    const row = readRow(items.eq(index), spec.fields, baseUrl);
    const rowChars = charsIn(row);
    if (outputChars + rowChars > MAX_OUTPUT_CHARS_PER_PAGE) {
      truncated = true;
      break;
    }
    outputChars += rowChars;
    rows.push(row);
  }

  return {
    rows,
    nextUrl: findNextUrl($, spec.nextPageSelector, baseUrl),
    truncated,
  };
}

/** Every selector in the spec must pass the allowlist before any parsing. */
function assertSelectorsAllowed(spec: ExtractSpec): void {
  const selectors = [
    spec.itemSelector,
    ...spec.fields.map((field) => field.selector),
    ...(spec.nextPageSelector === undefined ? [] : [spec.nextPageSelector]),
  ];
  for (const selector of selectors) {
    const check = checkSelector(selector);
    if (!check.ok) {
      throw new ExtractError(
        "selector_not_allowed",
        `selector refused (${check.reason})`,
      );
    }
  }
}

function parseBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ExtractError("extract_failed", "base URL is not a valid URL");
  }
  if (!isHttp(url)) {
    throw new ExtractError("extract_failed", "base URL is not http(s)");
  }
  return url;
}

/**
 * Iterative element-depth measure (`<html>` is depth 1); throws
 * page_too_deep past `maxDepth`. Only elements go on the stack.
 */
function assertDepthWithin(root: DocumentNode, maxDepth: number): void {
  const stack: { node: TreeNode; depth: number }[] = [{ node: root, depth: 0 }];
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    if (entry.depth > maxDepth) {
      throw new ExtractError("page_too_deep", `page deeper than ${maxDepth}`);
    }
    if (!("children" in entry.node)) continue;
    for (const child of entry.node.children) {
      if ("attribs" in child) {
        stack.push({ node: child, depth: entry.depth + 1 });
      }
    }
  }
}

function readRow(
  item: Cheerio<ElementNode>,
  fields: ExtractField[],
  baseUrl: URL,
): Row {
  const row: Row = {};
  for (const field of fields) {
    row[field.name] = readField(item, field, baseUrl);
  }
  return row;
}

function charsIn(row: Row): number {
  let chars = 0;
  for (const value of Object.values(row)) {
    if (value !== null) chars += value.length;
  }
  return chars;
}

function readField(
  item: Cheerio<ElementNode>,
  field: ExtractField,
  baseUrl: URL,
): string | null {
  const match = firstMatch(item, field.selector);
  if (match === undefined) return null;
  if (field.attribute === undefined) return textOf(match);
  return attributeOf(match, field.attribute, baseUrl);
}

/**
 * First element inside `item` matching `selector`. cheerio's `extract()`
 * with a single (non-array) descriptor selects with a limit of 1, so the
 * search stops at the first match instead of collecting all of them.
 */
function firstMatch(
  item: Cheerio<ElementNode>,
  selector: string,
): ElementNode | undefined {
  return item.extract({
    match: { selector, value: (element: ElementNode) => element },
  }).match;
}

function attributeOf(
  element: ElementNode,
  attribute: string,
  baseUrl: URL,
): string | null {
  // The HTML parser lower-cases attribute names.
  const name = attribute.toLowerCase();
  const value = element.attribs[name];
  if (value === undefined) return null;
  if (URL_ATTRIBUTES.has(name)) return resolveHttpUrl(value, baseUrl);
  const cell = new CellText();
  cell.append(value);
  return cell.toString();
}

/**
 * Resolves `raw` against `baseUrl`; null unless the result is http(s) and
 * fits in a cell (a cut URL would be a broken link).
 */
function resolveHttpUrl(raw: string, baseUrl: URL): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim(), baseUrl);
  } catch {
    return null;
  }
  if (!isHttp(url) || url.href.length > MAX_CELL_CHARS) return null;
  return url.href;
}

function isHttp(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Text content in document order, collected with an explicit stack (not
 * cheerio's recursive `.text()`). Skips script, style, noscript and template
 * content. Stops as soon as the cell is full.
 */
function textOf(element: ElementNode): string {
  const cell = new CellText();
  const stack: TreeNode[] = [element];
  for (
    let node = stack.pop();
    node !== undefined && !cell.isFull();
    node = stack.pop()
  ) {
    if ((node.type as string) === "text" && "data" in node) {
      cell.append(node.data);
    } else if ("attribs" in node && NON_TEXT_ELEMENTS.has(node.name)) {
      continue;
    } else if ("children" in node) {
      // Pushed last-to-first, so the first child pops first (document
      // order). A loop, not push(...children): a spread of a very wide
      // node would exceed the engine's argument limit.
      const { children } = node;
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) stack.push(child);
      }
    }
  }
  return cell.toString();
}

/** Same set as the regular expression `\s`. */
function isWhitespace(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    code === 0x20 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/**
 * Builds one cell value: whitespace runs collapsed to one space, leading
 * and trailing whitespace dropped, at most MAX_CELL_CHARS characters.
 *
 * Input is scanned in SCAN_CHUNK_CHARS steps and copied code unit by code
 * unit, so a huge text value is never copied whole, scanning stops once
 * the cell is full, and the result is a fresh string that keeps no
 * reference to the (possibly megabytes long) source text.
 */
class CellText {
  private readonly codes: number[] = [];
  /** Whitespace seen since the last kept character. */
  private pendingSpace = false;
  /** Set when a space plus the next character no longer fit. */
  private full = false;

  isFull(): boolean {
    return this.full || this.codes.length >= MAX_CELL_CHARS;
  }

  append(text: string): void {
    for (
      let start = 0;
      start < text.length && !this.isFull();
      start += SCAN_CHUNK_CHARS
    ) {
      this.scan(text, start, Math.min(start + SCAN_CHUNK_CHARS, text.length));
    }
  }

  toString(): string {
    let result = "";
    // Bounded slices keep each call well under the argument limit.
    for (let start = 0; start < this.codes.length; start += SCAN_CHUNK_CHARS) {
      result += String.fromCharCode(
        ...this.codes.slice(start, start + SCAN_CHUNK_CHARS),
      );
    }
    return result;
  }

  private scan(text: string, start: number, end: number): void {
    for (let index = start; index < end; index += 1) {
      const code = text.charCodeAt(index);
      if (isWhitespace(code)) {
        this.pendingSpace = true;
        continue;
      }
      if (this.pendingSpace && this.codes.length > 0) {
        // A space is only kept with a character after it, so the cell
        // never ends in a space.
        if (this.codes.length + 1 >= MAX_CELL_CHARS) {
          this.full = true;
          return;
        }
        this.codes.push(0x20);
      }
      this.pendingSpace = false;
      this.codes.push(code);
      if (this.isFull()) return;
    }
  }
}

/** First next-page match carrying an href, resolved; null unless http(s). */
function findNextUrl(
  $: CheerioAPI,
  selector: string | undefined,
  baseUrl: URL,
): string | null {
  if (selector === undefined) return null;
  for (const match of $.root().find(selector)) {
    const href = match.attribs.href;
    if (href !== undefined) return resolveHttpUrl(href, baseUrl);
  }
  return null;
}
