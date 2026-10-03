import type { StopReason } from "./run-status";

/**
 * Why a run failed, as a stable code the screens translate. The English
 * `message` stays for the server log and MCP; members only ever see the
 * translated `collectors.failure.<code>` text. Closed on purpose: a new
 * failure needs a new code and its EN/NL copy.
 */
export type FailureCode =
  | "not_a_feed"
  | "feed_status"
  | "https_only"
  | "invalid_address"
  | "redirect_loop"
  | "too_large"
  | "timeout"
  | "unreachable_address"
  | "site_refused"
  | "robots_disallowed"
  | "robots_unreachable"
  | "blocked_domain"
  | "collector_unavailable"
  | "input_invalid"
  | "worker_lost"
  | "page_too_slow"
  | "page_too_deep"
  | "page_too_complex"
  | "selector_not_allowed"
  | "not_a_page"
  | "page_status"
  | "generic";

export const FAILURE_CODES = [
  "not_a_feed",
  "feed_status",
  "https_only",
  "invalid_address",
  "redirect_loop",
  "too_large",
  "timeout",
  "unreachable_address",
  "site_refused",
  "robots_disallowed",
  "robots_unreachable",
  "blocked_domain",
  "collector_unavailable",
  "input_invalid",
  "worker_lost",
  "page_too_slow",
  "page_too_deep",
  "page_too_complex",
  "selector_not_allowed",
  "not_a_page",
  "page_status",
  "generic",
] as const satisfies readonly FailureCode[];

export type FailureDetail = {
  code: FailureCode;
  params?: Record<string, string | number>;
};

/**
 * Ends a run on purpose: a budget, a site rule, or a collector-detected
 * problem. `outcome: "succeeded"` means the rows so far are a valid partial
 * result (a limit was reached); `"failed"` means the member must act.
 * `message` is plain English for the log and MCP; `detail` is what the
 * member's screen translates.
 */
export class CollectorStop extends Error {
  constructor(
    readonly reason: StopReason,
    readonly outcome: "succeeded" | "failed",
    message: string,
    readonly detail?: FailureDetail,
  ) {
    super(message);
    this.name = "CollectorStop";
  }
}

/** The run's time budget is spent: the rows so far stand. */
export function timeLimitStop(): CollectorStop {
  return new CollectorStop(
    "time_limit",
    "succeeded",
    "Stopped at the time limit.",
  );
}

/** Stop reasons that are failure codes of the same name. */
const REASON_CODES: Partial<Record<StopReason, FailureCode>> = {
  site_refused: "site_refused",
  robots_disallowed: "robots_disallowed",
  robots_unreachable: "robots_unreachable",
  blocked_domain: "blocked_domain",
  worker_lost: "worker_lost",
};

/** The known low-level errors, each with its message and code. */
function knownError(
  err: unknown,
): (FailureDetail & { message: string }) | null {
  if (!(err instanceof Error)) return null;
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return { code: "timeout", message: "A site took too long to answer." };
  }
  if (err.message.startsWith("Refusing to fetch URL")) {
    return {
      code: "unreachable_address",
      message: "This address cannot be reached from our servers.",
    };
  }
  if (err.message === "Response too large") {
    return {
      code: "too_large",
      message: "A page was larger than the 5 MB limit.",
    };
  }
  if (err.message === "Too many redirects") {
    return {
      code: "redirect_loop",
      message: "A page redirected too many times.",
    };
  }
  return null;
}

/** A message safe to show a member; raw errors go to the server log only. */
export function userMessageFor(err: unknown): string {
  if (err instanceof CollectorStop) return err.message;
  return (
    knownError(err)?.message ??
    "Something went wrong while collecting. Try again later."
  );
}

/** The translatable sibling of `userMessageFor`: same errors, stable codes. */
export function failureDetailFor(err: unknown): FailureDetail {
  if (err instanceof CollectorStop) {
    return err.detail ?? { code: REASON_CODES[err.reason] ?? "generic" };
  }
  const known = knownError(err);
  return known ? { code: known.code } : { code: "generic" };
}
