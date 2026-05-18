import { describe, expect, it } from "vitest";

import {
  CONTRIBUTOR_WEIGHT_MAX,
  CONTRIBUTOR_WEIGHT_MIN,
  computeContributorWeightFromInputs,
} from "./contributor-weight";

describe("computeContributorWeightFromInputs", () => {
  it("floors at 0.1 for a brand-new account with no signals", () => {
    const w = computeContributorWeightFromInputs({
      accountAgeDays: 0,
      emailVerified: false,
      onboardingCompleted: false,
      badgeCount: 0,
    });
    expect(w).toBe(CONTRIBUTOR_WEIGHT_MIN);
  });

  it("rewards account age in two tiers", () => {
    const young = computeContributorWeightFromInputs({
      accountAgeDays: 10,
      emailVerified: false,
      onboardingCompleted: false,
      badgeCount: 0,
    });
    const old = computeContributorWeightFromInputs({
      accountAgeDays: 90,
      emailVerified: false,
      onboardingCompleted: false,
      badgeCount: 0,
    });
    expect(young).toBeGreaterThan(CONTRIBUTOR_WEIGHT_MIN);
    expect(old).toBeGreaterThan(young);
  });

  it("rewards email verification and onboarding", () => {
    const base = computeContributorWeightFromInputs({
      accountAgeDays: 60,
      emailVerified: false,
      onboardingCompleted: false,
      badgeCount: 0,
    });
    const verified = computeContributorWeightFromInputs({
      accountAgeDays: 60,
      emailVerified: true,
      onboardingCompleted: false,
      badgeCount: 0,
    });
    const onboarded = computeContributorWeightFromInputs({
      accountAgeDays: 60,
      emailVerified: true,
      onboardingCompleted: true,
      badgeCount: 0,
    });
    expect(verified).toBeGreaterThan(base);
    expect(onboarded).toBeGreaterThan(verified);
  });

  it("caps badge influence", () => {
    const oneBadge = computeContributorWeightFromInputs({
      accountAgeDays: 60,
      emailVerified: true,
      onboardingCompleted: true,
      badgeCount: 1,
    });
    const tenBadges = computeContributorWeightFromInputs({
      accountAgeDays: 60,
      emailVerified: true,
      onboardingCompleted: true,
      badgeCount: 10,
    });
    expect(tenBadges).toBeGreaterThanOrEqual(oneBadge);
    // Badge contribution alone is capped at +0.2.
    expect(tenBadges - oneBadge).toBeLessThanOrEqual(0.2);
  });

  it("ceilings at 1.0 for a fully-signaled account", () => {
    const w = computeContributorWeightFromInputs({
      accountAgeDays: 365,
      emailVerified: true,
      onboardingCompleted: true,
      badgeCount: 10,
    });
    expect(w).toBe(CONTRIBUTOR_WEIGHT_MAX);
  });
});
