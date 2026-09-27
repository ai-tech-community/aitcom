import {
  isAwaitingCompletionSync,
  type OnboardingStatus,
} from "./checklist-view";

/**
 * What the "Show the getting-started checklist" setting offers, derived from
 * the same server status the checklist surfaces read, plus this browser
 * session's "hide until next visit".
 *
 * - "switch": `showing` is what the member actually sees: on for the account
 *   (onboarding_dismissed_at IS NULL) and not hidden for this visit.
 *   `turnOn` is what switching it on has to undo:
 *   - "restore": the account-level "Don't show again" (server write; it also
 *     clears the visit hide).
 *   - "unhide": only this visit's hide (no server call; the account is on).
 * - "finished": every step is done, so the checklist never shows again
 *   whatever the switch says. The setting stays visible (disabled, with the
 *   reason) so a member who looks for it learns why instead of finding
 *   nothing.
 */
export type ChecklistSettingView =
  | {
      kind: "switch";
      showing: boolean;
      /** On for the account, hidden only until the next visit. */
      hiddenForVisit: boolean;
      turnOn: "restore" | "unhide";
    }
  | { kind: "finished" };

export function presentChecklistSetting(
  status: OnboardingStatus,
  { hiddenForVisit }: { hiddenForVisit: boolean },
): ChecklistSettingView {
  // Awaiting sync: every step reads as done and the reminder is about to
  // record completion; offering "show" would promise a checklist that the
  // presenter already hides.
  //
  // Known, self-correcting gap: for a dismissed member getStatus skips the
  // step queries and returns an empty checklist, so a dismissed member who
  // has in fact done every step still gets an enabled "off" switch here.
  // Turning it on refetches the full status, and the switch then settles on
  // "finished". Detecting it up front would put the step and auto-detect
  // queries back on every page load for dismissed members, which the early
  // return in getStatus exists to avoid.
  if (status.onboardingCompleted || isAwaitingCompletionSync(status)) {
    return { kind: "finished" };
  }
  if (status.dismissed) {
    return {
      kind: "switch",
      showing: false,
      hiddenForVisit: false,
      turnOn: "restore",
    };
  }
  return {
    kind: "switch",
    showing: !hiddenForVisit,
    hiddenForVisit,
    turnOn: hiddenForVisit ? "unhide" : "restore",
  };
}
