import { load, type Cheerio, type CheerioAPI } from "cheerio";
import { checkSelector } from "../../../lib/collectors/selector-policy";
import {
  ExtractError,
  MAX_CELL_CHARS,
  MAX_DEPTH,
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

/** Attributes whose value is a link; resolved and kept only when http(s). */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src", "action"]);

export function extractList(html: string, spec: ExtractSpec): ExtractResult {
  assertSelectorsAllowed(spec);
  const baseUrl = parseBaseUrl(spec.baseUrl);

  const $ = load(html);
  const document = $.root()[0];
  if (document === undefined) {
    throw new ExtractError("extract_failed", "page did not parse");
  }
  assertDepthWithin(document, MAX_DEPTH);

  const rows: Record<string, string | null>[] = [];
  // `root().find()`, not `$(selector)`: `$()` would treat a string starting
  // with "<" as HTML to build, not as a selector.
  const items = $.root().find(spec.itemSelector);
  const itemCount = Math.min(items.length, MAX_ROWS_PER_PAGE);
  for (let index = 0; index < itemCount; index += 1) {
    const item = items.eq(index);
    const row: Record<string, string | null> = {};
    for (const field of spec.fields) {
      row[field.name] = readField(item, field, baseUrl);
    }
    rows.push(row);
  }

  return { rows, nextUrl: findNextUrl($, spec.nextPageSelector, baseUrl) };
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

/** Iterative depth measure; throws page_too_deep past `maxDepth`. */
function assertDepthWithin(root: DocumentNode, maxDepth: number): void {
  const stack: { node: TreeNode; depth: number }[] = [{ node: root, depth: 0 }];
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    if (entry.depth > maxDepth) {
      throw new ExtractError("page_too_deep", `page deeper than ${maxDepth}`);
    }
    if ("children" in entry.node) {
      for (const child of entry.node.children) {
        stack.push({ node: child, depth: entry.depth + 1 });
      }
    }
  }
}

function readField(
  item: Cheerio<ElementNode>,
  field: ExtractField,
  baseUrl: URL,
): string | null {
  const match = item.find(field.selector).first()[0];
  if (match === undefined) return null;
  if (field.attribute === undefined) return textOf(match);
  return attributeOf(match, field.attribute, baseUrl);
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
  return value.trim().slice(0, MAX_CELL_CHARS);
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

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

function normalizeWhitespace(text: string): string {
  return collapseWhitespace(text).trim();
}

/**
 * Text content in document order, collected with an explicit stack (not
 * cheerio's recursive `.text()`). Whitespace collapsed, trimmed and capped;
 * stops early once the cap is passed.
 */
function textOf(element: ElementNode): string {
  let collected = "";
  const stack: TreeNode[] = [element];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if ((node.type as string) === "text" && "data" in node) {
      collected += node.data;
      if (collected.length > MAX_CELL_CHARS) {
        // Collapse but do not trim yet, so a space between this text and
        // the next survives. The final trim drops at most one leading and
        // one trailing space, so past MAX + 2 the cell is already full.
        collected = collapseWhitespace(collected);
        if (collected.length > MAX_CELL_CHARS + 2) break;
      }
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
  return normalizeWhitespace(collected).slice(0, MAX_CELL_CHARS);
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
