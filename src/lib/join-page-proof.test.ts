import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  JOIN_MEMBER_PROOF,
  JOIN_WEEKLY_QUESTION,
  consentedJoinMembers,
  joinMemberInitials,
  resolveJoinWeeklyQuestion,
  type JoinMemberProofInput,
} from "./join-page-proof";

const MEMBER: JoinMemberProofInput = {
  name: "Ada Lovelace",
  role: "Builder",
  line: "I come for the events.",
  testimonialConsent: true,
};

describe("join page proof", () => {
  it("ships no quotes and no weekly thread", () => {
    expect(JOIN_MEMBER_PROOF).toEqual([]);
    expect(JOIN_WEEKLY_QUESTION).toBeNull();
    expect(consentedJoinMembers(JOIN_MEMBER_PROOF)).toEqual([]);
    expect(resolveJoinWeeklyQuestion(JOIN_WEEKLY_QUESTION)).toBeNull();
  });

  it("keeps only members who consented, with a safe photo or none", () => {
    expect(
      consentedJoinMembers([
        MEMBER,
        { ...MEMBER, name: "No Consent", testimonialConsent: false },
        { ...MEMBER, name: "  ", testimonialConsent: true },
        {
          ...MEMBER,
          name: "Grace Hopper",
          photoUrl: "javascript:alert(1)",
        },
        {
          ...MEMBER,
          name: "Katherine Johnson",
          photoUrl: "https://cdn.example/kj.jpg",
        },
      ]),
    ).toEqual([
      {
        name: "Ada Lovelace",
        role: "Builder",
        line: "I come for the events.",
        testimonialConsent: true,
      },
      {
        name: "Grace Hopper",
        role: "Builder",
        line: "I come for the events.",
        testimonialConsent: true,
      },
      {
        name: "Katherine Johnson",
        role: "Builder",
        line: "I come for the events.",
        photoUrl: "https://cdn.example/kj.jpg",
        testimonialConsent: true,
      },
    ]);
  });

  it("draws initials when there is no photo", () => {
    expect(joinMemberInitials("Ada Lovelace")).toBe("AL");
    expect(joinMemberInitials("Ada")).toBe("AD");
    expect(joinMemberInitials("")).toBe("?");
  });

  it("accepts a real on-site discussion path and rejects everything else", () => {
    expect(
      resolveJoinWeeklyQuestion({
        title: "What are you shipping?",
        threadPath: "/communities/ait/forum/hello-neighbours",
      }),
    ).toEqual({
      title: "What are you shipping?",
      href: "/communities/ait/forum/hello-neighbours",
    });
    expect(
      resolveJoinWeeklyQuestion({
        title: "What are you shipping?",
        threadPath:
          "https://www.aitcommunity.org/en/communities/ait/forum/hello-neighbours",
      })?.href,
    ).toBe("/communities/ait/forum/hello-neighbours");
    expect(
      resolveJoinWeeklyQuestion({
        title: "What are you shipping?",
        threadPath: "https://aitcommunity.org/nl/forum/intro",
      })?.href,
    ).toBe("/forum/intro");

    for (const threadPath of [
      "/forum/new",
      "/forum",
      "/communities/ait/forum",
      "/en/news/stories/a-story",
      "/auth/signup",
      "https://example.com/communities/ait/forum/made-up",
      "not a url",
    ]) {
      expect(
        resolveJoinWeeklyQuestion({
          title: "What are you shipping?",
          threadPath,
        }),
      ).toBeNull();
    }
    expect(
      resolveJoinWeeklyQuestion({
        title: "No",
        threadPath: "/communities/ait/forum/hello-neighbours",
      }),
    ).toBeNull();
  });

  it("jobs, startups, and events each have a public page", () => {
    for (const route of ["jobs", "startups", "events"]) {
      expect(
        existsSync(join(process.cwd(), "src/app/[locale]", route, "page.tsx")),
        route,
      ).toBe(true);
    }
  });
});
