import type { MemberCard } from "@/server/members/member-card";

/** A member card a viewer may open, with a full preview. */
export function openMemberCard(
  overrides: Partial<MemberCard> = {},
): MemberCard {
  return {
    canOpenProfile: true,
    bio: "Connects founders across the Netherlands.",
    profile: {
      company: "Acme",
      skills: ["Community building", "Events"],
      level: 3,
      tier: "beginner",
    },
    ...overrides,
  };
}

/** A private profile's card: no link, no details. */
export const PRIVATE_MEMBER_CARD: MemberCard = {
  canOpenProfile: false,
  bio: null,
  profile: null,
};
