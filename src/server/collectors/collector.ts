import type { z } from "zod";

export type LocalizedText = { en: string; nl: string };

export type FieldHint = {
  label: LocalizedText;
  help?: LocalizedText;
  placeholder?: string;
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
