// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BADGE_CATALOG,
  BADGE_SLUGS,
  BADGE_TRACK_IDS,
  badgesOfTrack,
  catalogBadge,
  isBadgeSlug,
  reachedTiers,
} from "@/lib/badges/catalog";

describe("badge catalog", () => {
  it("has unique slugs", () => {
    expect(new Set(BADGE_SLUGS).size).toBe(BADGE_SLUGS.length);
  });

  it("gives every track three tiers with ascending thresholds", () => {
    for (const track of BADGE_TRACK_IDS) {
      const tiers = badgesOfTrack(track);
      expect(
        tiers.map((badge) => badge.tier),
        track,
      ).toEqual([1, 2, 3]);
      const thresholds = tiers.map((badge) => badge.threshold);
      expect(thresholds[0], track).toBeGreaterThan(0);
      expect(
        thresholds.every((value, i) => i === 0 || value > thresholds[i - 1]!),
        track,
      ).toBe(true);
    }
  });

  it("has the spec's tracks", () => {
    expect(BADGE_TRACK_IDS).toEqual([
      "regular",
      "host",
      "challenger",
      "writer",
      "builder",
      "learner",
      "teacher",
      "connector",
      "agent_wrangler",
      "benchmarker",
      "streak",
    ]);
  });

  it("keeps the stored legacy slugs as tier identifiers", () => {
    const tierOf = (slug: string) => {
      const badge = catalogBadge(slug);
      return badge?.kind === "track" ? [badge.track, badge.tier] : null;
    };
    expect(tierOf("first_event")).toEqual(["regular", 1]);
    expect(tierOf("regular")).toEqual(["regular", 2]);
    expect(tierOf("veteran")).toEqual(["regular", 3]);
    expect(tierOf("article_author")).toEqual(["writer", 1]);
    expect(tierOf("prolific_writer")).toEqual(["writer", 2]);
    expect(tierOf("first_challenge")).toEqual(["challenger", 1]);
    expect(tierOf("first_launch")).toEqual(["builder", 1]);
    expect(tierOf("course_complete")).toEqual(["learner", 1]);
    expect(tierOf("agent_master")).toEqual(["agent_wrangler", 1]);
    expect(tierOf("benchmark-coverage-first")).toEqual(["benchmarker", 1]);
    expect(tierOf("benchmark-coverage-10")).toEqual(["benchmarker", 2]);
    expect(tierOf("benchmark-coverage-50")).toEqual(["benchmarker", 3]);
  });

  it("keeps milestones and the limited edition", () => {
    expect(catalogBadge("profile_complete")?.kind).toBe("milestone");
    expect(catalogBadge("onboarding_complete")?.kind).toBe("milestone");
    expect(catalogBadge("tutorial_creator")?.kind).toBe("milestone");
    const early = catalogBadge("early_adopter");
    expect(early?.kind).toBe("limitedEdition");
    expect(early?.kind === "limitedEdition" && early.editionSize).toBe(100);
  });

  it("drops the badges that could never be earned", () => {
    for (const slug of [
      "speaker",
      "challenge_streak_3",
      "challenge_streak_10",
      "mission_impossible",
      "challenge_proposer",
      "repo_first",
      "test_perfect",
      "challenge_helper",
      "sponsor_pick",
      "challenge_author",
      "speed_demon",
      "agent_collab",
      "streak_10",
    ]) {
      expect(isBadgeSlug(slug), slug).toBe(false);
    }
  });

  it("is safe to look up untrusted slugs", () => {
    expect(catalogBadge("toString")).toBeNull();
    expect(catalogBadge("__proto__")).toBeNull();
    expect(isBadgeSlug("constructor")).toBe(false);
  });

  it("gives every badge a glyph and message keys", () => {
    for (const badge of BADGE_CATALOG) {
      expect(badge.glyph, badge.slug).toBeTruthy();
      expect(badge.nameKey).toBe(`names.${badge.slug}`);
    }
  });

  it("reaches every tier up to the metric, at once", () => {
    expect(reachedTiers("regular", 0)).toEqual([]);
    expect(reachedTiers("regular", 1).map((b) => b.slug)).toEqual([
      "first_event",
    ]);
    expect(reachedTiers("regular", 10).map((b) => b.slug)).toEqual([
      "first_event",
      "regular",
      "veteran",
    ]);
  });
});
