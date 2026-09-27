import { describe, expect, it } from "vitest";

import { presentChecklistSetting } from "./checklist-setting-view";
import type { OnboardingStatus } from "./checklist-view";

const VISIBLE = { hiddenForVisit: false };
const HIDDEN = { hiddenForVisit: true };

const step = (slug: string, completed: boolean) => ({
  slug,
  labelKey: slug,
  href: `/${slug}`,
  completed,
});

function status(overrides: Record<string, unknown> = {}): OnboardingStatus {
  return {
    hasProfile: true,
    hasIntent: true,
    onboardingCompleted: false,
    dismissed: false,
    checklist: [step("a", true), step("b", false)],
    ...overrides,
  } as OnboardingStatus;
}

describe("presentChecklistSetting", () => {
  it("is on while the checklist is not dismissed", () => {
    expect(presentChecklistSetting(status(), VISIBLE)).toEqual({
      kind: "switch",
      showing: true,
      hiddenForVisit: false,
      turnOn: "restore",
    });
  });

  it("is off after Don't show again", () => {
    expect(
      presentChecklistSetting(
        status({ dismissed: true, checklist: [] }),
        VISIBLE,
      ),
    ).toEqual({
      kind: "switch",
      showing: false,
      hiddenForVisit: false,
      turnOn: "restore",
    });
  });

  it("is on for a member without a profile row (never dismissed)", () => {
    expect(
      presentChecklistSetting(
        status({ hasProfile: false, hasIntent: false, checklist: [] }),
        VISIBLE,
      ),
    ).toEqual({
      kind: "switch",
      showing: true,
      hiddenForVisit: false,
      turnOn: "restore",
    });
  });

  it("is on before the welcome questions are answered", () => {
    expect(
      presentChecklistSetting(
        status({ hasIntent: false, checklist: [] }),
        VISIBLE,
      ),
    ).toEqual({
      kind: "switch",
      showing: true,
      hiddenForVisit: false,
      turnOn: "restore",
    });
  });

  it("is finished once onboarding is completed, dismissed or not", () => {
    expect(
      presentChecklistSetting(status({ onboardingCompleted: true }), VISIBLE),
    ).toEqual({ kind: "finished" });
    expect(
      presentChecklistSetting(
        status({ onboardingCompleted: true, dismissed: true }),
        VISIBLE,
      ),
    ).toEqual({ kind: "finished" });
  });

  it("is finished when every step reads done but completion is not synced yet", () => {
    expect(
      presentChecklistSetting(
        status({ checklist: [step("a", true), step("b", true)] }),
        VISIBLE,
      ),
    ).toEqual({ kind: "finished" });
  });

  it("is off, and only needs unhiding, when on for the account but hidden for this visit", () => {
    expect(presentChecklistSetting(status(), HIDDEN)).toEqual({
      kind: "switch",
      showing: false,
      hiddenForVisit: true,
      turnOn: "unhide",
    });
  });

  it("restores on the server when dismissed, whatever the visit flag says", () => {
    expect(
      presentChecklistSetting(
        status({ dismissed: true, checklist: [] }),
        HIDDEN,
      ),
    ).toEqual({
      kind: "switch",
      showing: false,
      hiddenForVisit: false,
      turnOn: "restore",
    });
  });

  it("stays finished when hidden for this visit", () => {
    expect(
      presentChecklistSetting(status({ onboardingCompleted: true }), HIDDEN),
    ).toEqual({ kind: "finished" });
  });

  it("cannot see that a dismissed member already did every step (known, self-correcting)", () => {
    // getStatus skips the step queries for dismissed members, so the switch
    // is offered; turning it on refetches and it settles on "finished".
    expect(
      presentChecklistSetting(
        status({ dismissed: true, checklist: [] }),
        VISIBLE,
      ),
    ).toMatchObject({ kind: "switch", turnOn: "restore" });
  });
});
