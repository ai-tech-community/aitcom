import type { StopReason } from "./run-status";

/**
 * Ends a run on purpose: a budget, a site rule, or a collector-detected
 * problem. `outcome: "succeeded"` means the rows so far are a valid partial
 * result (a limit was reached); `"failed"` means the member must act.
 * `message` is shown to the member, so it must be plain and safe.
 */
export class CollectorStop extends Error {
  constructor(
    readonly reason: StopReason,
    readonly outcome: "succeeded" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "CollectorStop";
  }
}

/** A message safe to show a member; raw errors go to the server log only. */
export function userMessageFor(err: unknown): string {
  if (err instanceof CollectorStop) return err.message;
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "A site took too long to answer.";
    }
    if (err.message.startsWith("Refusing to fetch URL")) {
      return "This address cannot be reached from our servers.";
    }
    if (err.message === "Response too large") {
      return "A page was larger than the 5 MB limit.";
    }
    if (err.message === "Too many redirects") {
      return "A page redirected too many times.";
    }
  }
  return "Something went wrong while collecting. Try again later.";
}
