import { describe, expect, it } from "vitest";

import {
  COMMUNITY_DESCRIPTION_MAX,
  communityDescriptionSchema,
  presentCommunityDescription,
} from "./description";

const CUT_MID_WORD =
  "Owner to Owner is a place for people who run a small business. You come for the advice and stay f";

describe("community description", () => {
  it("accepts the full settings length and rejects one character past it", () => {
    expect(COMMUNITY_DESCRIPTION_MAX).toBe(2000);
    expect(communityDescriptionSchema.safeParse("a".repeat(2000)).success).toBe(
      true,
    );
    expect(communityDescriptionSchema.safeParse("a".repeat(2001)).success).toBe(
      false,
    );
  });

  it("returns a stored mid-word description in full, without a response cut", () => {
    expect(presentCommunityDescription(CUT_MID_WORD)).toEqual({
      description: CUT_MID_WORD,
      descriptionTruncated: false,
    });
  });

  it("returns a description longer than the old 500-character cap in full", () => {
    const stored = `${"word ".repeat(120)}end.`;
    expect(stored.length).toBeGreaterThan(500);
    expect(presentCommunityDescription(stored)).toEqual({
      description: stored,
      descriptionTruncated: false,
    });
  });

  it("keeps an empty description empty", () => {
    expect(presentCommunityDescription(null)).toEqual({
      description: null,
      descriptionTruncated: false,
    });
  });
});
