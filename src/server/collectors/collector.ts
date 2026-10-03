import type { z } from "zod";

import type { ExtractResult, ExtractSpec } from "./extract/protocol";

export type LocalizedText = { en: string; nl: string };

export type FieldHint = {
  label: LocalizedText;
  help?: LocalizedText;
  placeholder?: string;
  /** For a field that is a list of rows: a hint per column of a row. */
  columns?: Record<string, FieldHint>;
};

export type CollectorLimits = {
  maxPages: number;
  maxItems: number;
  maxDurationMs: number;
};

export interface CollectorResponse {
  /** The URL that answered (after the context followed redirects). */
  url: string;
  status: number;
  headers: Headers;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/**
 * The only door a collector has to the outside world (protection Proxy,
 * ADR-0040). Every rule — robots.txt, per-site rate limit, budgets,
 * blocklist, SSRF guard — lives behind `fetch`.
 */
export interface CollectorContext {
  fetch(url: string, opts?: { accept?: string }): Promise<CollectorResponse>;
  /**
   * Reads a list out of a fetched page, outside the collector's own code
   * (a sandboxed worker with a deadline). Links resolve against `page.url`.
   * A page or selector it refuses ends the run.
   */
  extractList(
    page: { html: string; url: string },
    spec: Omit<ExtractSpec, "baseUrl">,
  ): Promise<ExtractResult>;
  /** A short line the member sees on the run page. */
  log(message: string): void;
  /** Aborts when the run's time budget ends. */
  signal: AbortSignal;
}

/**
 * A data collector (Strategy). Receives only its validated input and the
 * context; yields rows one at a time (Iterator), hiding pagination.
 */
export interface Collector<I, R extends Record<string, unknown>> {
  id: string;
  version: number;
  /** Marketplace seam: widened to a member reference later. */
  author: "platform";
  kind: "api" | "feed" | "page";
  title: LocalizedText;
  description: LocalizedText;
  inputSchema: z.ZodType<I>;
  itemSchema: z.ZodType<R>;
  fieldHints: { [K in keyof I]-?: FieldHint };
  sampleItem: R;
  limits: CollectorLimits;
  run(input: I, ctx: CollectorContext): AsyncIterable<R>;
}

// `run` takes I contravariantly, so a catalog of mixed collectors needs `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCollector = Collector<any, any>;
