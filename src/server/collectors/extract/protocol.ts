/**
 * Shared shapes for HTML list extraction. Imported by the pure extractor,
 * the sandboxed worker and the code that starts the worker, so it must stay
 * free of Node-only and Next-only imports.
 */

/** Deepest element nesting a page may have; deeper pages are refused. */
export const MAX_DEPTH = 512;
/** Most rows kept from one page; further items are dropped (`truncated`). */
export const MAX_ROWS_PER_PAGE = 5_000;
/** Longest cell value, in characters, after trimming and collapsing. */
export const MAX_CELL_CHARS = 2_000;
/**
 * Most characters kept from one page, summed over every cell value. Rows
 * that would go past it are dropped and the result says `truncated`.
 */
export const MAX_OUTPUT_CHARS_PER_PAGE = 2_000_000;

export type ExtractField = {
  /** Column name in the output row. */
  name: string;
  /**
   * CSS selector, matched inside each item; the first match is used. `null`
   * reads the item element itself (its text, or its own attribute).
   */
  selector: string | null;
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
  /** The next-page link's address, resolved; null when there is none. */
  nextUrl: string | null;
  /**
   * True when a next-page link was found but its address was longer than
   * MAX_CELL_CHARS, so it was dropped and `nextUrl` is null.
   */
  nextUrlTooLong: boolean;
  /**
   * True when rows were dropped: the page had more than MAX_ROWS_PER_PAGE
   * items, or the rows would pass MAX_OUTPUT_CHARS_PER_PAGE.
   */
  truncated: boolean;
};

/**
 * Why a page could not be read. The worker answers with its own codes; the
 * sandbox adds `page_too_slow` (the deadline passed), `page_too_complex` (the
 * worker ran out of memory) and `extract_failed` (it crashed or was closed).
 * A runtime list, so a code read off the wire can be checked.
 */
export const EXTRACT_ERROR_CODES = [
  "page_too_deep",
  "page_too_slow",
  "page_too_complex",
  "selector_not_allowed",
  "extract_failed",
] as const;

export type ExtractErrorCode = (typeof EXTRACT_ERROR_CODES)[number];

export function isExtractErrorCode(value: unknown): value is ExtractErrorCode {
  return (
    typeof value === "string" &&
    (EXTRACT_ERROR_CODES as readonly string[]).includes(value)
  );
}

export class ExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ExtractError";
    this.code = code;
  }
}

/** Main thread → worker: extract one page. */
export type WorkerRequest = {
  id: number;
  html: string;
  spec: ExtractSpec;
};

/** Worker → main thread: sent once, when the worker can take requests. */
export type WorkerReady = { type: "ready" };

/** Worker → main thread: the answer to the request with the same `id`. */
export type WorkerResponse =
  | { id: number; ok: true; result: ExtractResult }
  | { id: number; ok: false; code: ExtractErrorCode };

export type WorkerMessage = WorkerReady | WorkerResponse;
