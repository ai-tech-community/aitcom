/**
 * Shared shapes for HTML list extraction. Imported by the pure extractor,
 * the sandboxed worker and the code that starts the worker, so it must stay
 * free of Node-only and Next-only imports.
 */

/** Deepest element nesting a page may have; deeper pages are refused. */
export const MAX_DEPTH = 512;
/** Most rows kept from one page; further items are ignored. */
export const MAX_ROWS_PER_PAGE = 5_000;
/** Longest cell value, in characters, after trimming and collapsing. */
export const MAX_CELL_CHARS = 2_000;

export type ExtractField = {
  /** Column name in the output row. */
  name: string;
  /** CSS selector, matched inside each item; the first match is used. */
  selector: string;
  /** Attribute to read; the element's text is used when absent. */
  attribute?: string;
};

export type ExtractSpec = {
  /** URL of the page; relative links resolve against it. */
  baseUrl: string;
  /** CSS selector for one item (one output row). */
  itemSelector: string;
  fields: ExtractField[];
  /** CSS selector for the next-page link. */
  nextPageSelector?: string;
};

export type ExtractResult = {
  rows: Record<string, string | null>[];
  nextUrl: string | null;
};

export type ExtractErrorCode =
  | "page_too_deep"
  | "page_too_slow"
  | "selector_not_allowed"
  | "extract_failed";

export class ExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ExtractError";
    this.code = code;
  }
}
