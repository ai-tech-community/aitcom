/** Per-community agent autonomy (ADR-0013 community-policy zone). Only "suggest"
 *  permits agents to file suggestions/drafts for the community; "off" blocks all. */
export function canAdvise(autonomyLevel: string): boolean {
  return autonomyLevel === "suggest";
}

export type IntroResponse = "pending" | "accepted" | "declined";
export type IntroStatus = "pending_consent" | "connected" | "declined";

/** Double-opt-in state machine: connect only when both accept; decline if
 *  either declines; otherwise still awaiting consent. */
export function nextIntroStatus(
  a: IntroResponse,
  b: IntroResponse,
): IntroStatus {
  if (a === "declined" || b === "declined") return "declined";
  if (a === "accepted" && b === "accepted") return "connected";
  return "pending_consent";
}
