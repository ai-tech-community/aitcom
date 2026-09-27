import { describe, expect, it } from "vitest";

import { presentChecklistSetting } from "./checklist-setting-view";
import type { OnboardingStatus } from "./checklist-view";

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
    expect(presentChecklistSetting(status())).toEqual({
      kind: "switch",
      showing: true,
    });
  });

  it("is off after Don't show again", () => {
    expect(
      presentChecklistSetting(status({ dismissed: true, checklist: [] })),
    ).toEqual({ kind: "switch", showing: false });
  });

  it("is on for a member without a profile row (never dismissed)", () => {
    expect(
      presentChecklistSetting(
        status({ hasProfile: false, hasIntent: false, checklist: [] }),
      ),
    ).toEqual({ kind: "switch", showing: true });
  });

  it("is on before the welcome questions are answered", () => {
    expect(
      presentChecklistSetting(status({ hasIntent: false, checklist: [] })),
    ).toEqual({ kind: "switch", showing: true });
  });

  it("is finished once onboarding is completed, dismissed or not", () => {
    expect(
      presentChecklistSetting(status({ onboardingCompleted: true })),
    ).toEqual({ kind: "finished" });
    expect(
      presentChecklistSetting(
        status({ onboardingCompleted: true, dismissed: true }),
      ),
    ).toEqual({ kind: "finished" });
  });

  it("is finished when every step reads done but completion is not synced yet", () => {
    expect(
      presentChecklistSetting(
        status({ checklist: [step("a", true), step("b", true)] }),
      ),
    ).toEqual({ kind: "finished" });
  });
});
