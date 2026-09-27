import { describe, expect, it } from "vitest";

import {
  isAwaitingCompletionSync,
  presentOnboardingChecklist,
  type OnboardingStatus,
} from "./checklist-view";

const step = (slug: string, completed: boolean) => ({
  slug,
  labelKey: slug,
  href: `/${slug}`,
  completed,
});

// Loose overrides: getStatus returns a union, so Partial<> of it is too narrow.
function status(overrides: Record<string, unknown> = {}): OnboardingStatus {
  return {
    hasProfile: true,
    hasIntent: true,
    onboardingCompleted: false,
    dismissed: false,
    checklist: [
      step("a", true),
      step("b", true),
      step("c", false),
      step("d", false),
      step("e", false),
    ],
    ...overrides,
  } as OnboardingStatus;
}

describe("presentOnboardingChecklist", () => {
  it("is hidden while there is no status yet", () => {
    expect(presentOnboardingChecklist(undefined)).toEqual({ kind: "hidden" });
  });

  it("shows the checklist with counts and percent while steps are open", () => {
    const view = presentOnboardingChecklist(status());
    expect(view).toMatchObject({
      kind: "checklist",
      completedCount: 2,
      totalCount: 5,
      percent: 40,
    });
  });

  it("is hidden once onboarding is completed on the server", () => {
    expect(
      presentOnboardingChecklist(
        status({ onboardingCompleted: true, checklist: [] }),
      ),
    ).toEqual({ kind: "hidden" });
  });

  it("is hidden once the member chose don't show again (account-level)", () => {
    expect(presentOnboardingChecklist(status({ dismissed: true }))).toEqual({
      kind: "hidden",
    });
  });

  it("is hidden when every step reads as done but the server has not caught up", () => {
    expect(
      presentOnboardingChecklist(
        status({ checklist: [step("a", true), step("b", true)] }),
      ),
    ).toEqual({ kind: "hidden" });
  });

  it("is hidden when the checklist is empty", () => {
    expect(presentOnboardingChecklist(status({ checklist: [] }))).toEqual({
      kind: "hidden",
    });
  });

  it("shows the welcome prompt before the intent questions are answered", () => {
    expect(presentOnboardingChecklist(status({ hasIntent: false }))).toEqual({
      kind: "welcome",
    });
  });

  it("dismissal also hides the welcome prompt", () => {
    expect(
      presentOnboardingChecklist(status({ hasIntent: false, dismissed: true })),
    ).toEqual({ kind: "hidden" });
  });
});

describe("isAwaitingCompletionSync", () => {
  it("is true only when every step reads done and the server has not recorded it", () => {
    const allDone = [step("a", true), step("b", true)];
    expect(isAwaitingCompletionSync(status({ checklist: allDone }))).toBe(true);
    expect(isAwaitingCompletionSync(status())).toBe(false);
    expect(
      isAwaitingCompletionSync(
        status({ checklist: allDone, onboardingCompleted: true }),
      ),
    ).toBe(false);
    expect(
      isAwaitingCompletionSync(
        status({ checklist: allDone, hasProfile: false }),
      ),
    ).toBe(false);
    expect(isAwaitingCompletionSync(undefined)).toBe(false);
  });
});
