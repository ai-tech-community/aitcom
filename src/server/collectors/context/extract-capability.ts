import type { CollectorContext } from "../collector";
import { CollectorStop, type FailureCode, timeLimitStop } from "../errors";
import {
  ExtractError,
  type ExtractErrorCode,
  type ExtractResult,
  type ExtractSpec,
} from "../extract/protocol";

/** Whatever reads a page's list: the sandboxed worker, or the pure extractor. */
export interface PageExtractor {
  extract(html: string, spec: ExtractSpec): Promise<ExtractResult>;
}

/** The run's time budget, as extraction needs to see it. */
export interface RunClock {
  /** True once the run's deadline has passed or the run was aborted. */
  isOver(): boolean;
}

/** Each extraction refusal as the stop a member sees. */
const EXTRACT_FAILURES: Record<
  ExtractErrorCode,
  { code: FailureCode; message: string }
> = {
  page_too_slow: {
    code: "page_too_slow",
    message: "This page took too long to read, so we stopped.",
  },
  page_too_deep: {
    code: "page_too_deep",
    message: "This page is nested too deeply to read safely.",
  },
  page_too_complex: {
    code: "page_too_complex",
    message: "This page is too large or complex for us to read.",
  },
  selector_not_allowed: {
    code: "selector_not_allowed",
    message: "One of the selectors uses a feature we don't allow.",
  },
  extract_failed: {
    code: "generic",
    message: "Something went wrong while reading this page.",
  },
};

/**
 * The context's `extractList`, served by `extractor`. Links resolve against
 * the page's own URL, and an extraction refusal ends the run as a failed
 * CollectorStop with a translatable code. A run whose time is up stops at
 * the time limit instead: before extracting, and when extraction fails after
 * the run was ended (the failure is then a symptom of the abort). Shared by
 * the live context and the test fake, so both report refusals the same way.
 */
export function extractListVia(
  extractor: PageExtractor,
  clock: RunClock,
): CollectorContext["extractList"] {
  return async (page, spec) => {
    if (clock.isOver()) throw timeLimitStop();
    try {
      return await extractor.extract(page.html, {
        ...spec,
        baseUrl: page.url,
      });
    } catch (err) {
      if (clock.isOver()) throw timeLimitStop();
      if (!(err instanceof ExtractError)) throw err;
      const failure = EXTRACT_FAILURES[err.code];
      throw new CollectorStop("error", "failed", failure.message, {
        code: failure.code,
      });
    }
  };
}
