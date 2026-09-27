import {
  isAwaitingCompletionSync,
  type OnboardingStatus,
} from "./checklist-view";

/**
 * What the "Show the getting-started checklist" setting offers, derived from
 * the same server status the checklist surfaces read.
 *
 * - "switch": the member can turn the checklist on or off; `showing` mirrors
 *   onboarding_dismissed_at IS NULL.
 * - "finished": every step is done, so the checklist never shows again
 *   whatever the switch says. The setting stays visible (disabled, with the
 *   reason) so a member who looks for it learns why instead of finding
 *   nothing.
 */
export type ChecklistSettingView =
  | { kind: "switch"; showing: boolean }
  | { kind: "finished" };

export function presentChecklistSetting(
  status: OnboardingStatus,
): ChecklistSettingView {
  // Awaiting sync: every step reads as done and the reminder is about to
  // record completion; offering "show" would promise a checklist that the
  // presenter already hides.
  if (status.onboardingCompleted || isAwaitingCompletionSync(status)) {
    return { kind: "finished" };
  }
  return { kind: "switch", showing: !status.dismissed };
}
