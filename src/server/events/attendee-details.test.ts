import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

const { toAttendeeDetails } = await import("./attendee-details");
type Row = Parameters<typeof toAttendeeDetails>[0];

const PROFILE = {
  displayName: "Ada",
  isPublic: true,
  company: "Analytical Engines",
  linkedinUrl: "https://linkedin.com/in/ada",
  githubUrl: null,
  websiteUrl: null,
  experienceLevel: "advanced",
  skills: ["math"],
  interests: null,
};

const ROW: Row = {
  registrationId: "r1",
  status: "registered",
  registeredAt: new Date("2026-10-01T10:00:00Z"),
  paymentStatus: null,
  checkedInAt: null,
  organizerNoticeAt: new Date("2026-10-01T10:00:00Z"),
  account: {
    name: "ada_l",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
  profile: PROFILE,
  waitlistPosition: null,
  communityMemberSince: new Date("2026-01-01T00:00:00Z"),
  pastEventsAttended: 3,
  answers: [
    {
      questionId: "hope",
      question: "What do you hope to learn?",
      type: "long_text",
      value: "Agents",
    },
  ],
};

describe("toAttendeeDetails", () => {
  it("shows a public profile in full", () => {
    expect(toAttendeeDetails(ROW)).toMatchObject({
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      detailsShared: true,
      pastEventsAttended: 3,
      profile: {
        company: "Analytical Engines",
        linkedinUrl: "https://linkedin.com/in/ada",
        skills: ["math"],
        interests: [],
      },
    });
  });

  it("shows name, email, registration and answers for a private profile", () => {
    const details = toAttendeeDetails({
      ...ROW,
      profile: { ...PROFILE, isPublic: false },
    });
    expect(details.email).toBe("ada@example.com");
    expect(details.profile).toBeNull();
    // Answers were written for the organizer; a private profile keeps them.
    expect(details.answers).toEqual(ROW.answers);
  });

  it("works without a member profile", () => {
    const details = toAttendeeDetails({ ...ROW, profile: null });
    expect(details.profile).toBeNull();
    expect(details.displayName).toBe("Ada Lovelace");
  });

  it("shows only name and status when registered before the notice", () => {
    const details = toAttendeeDetails({ ...ROW, organizerNoticeAt: null });
    expect(details).toMatchObject({
      displayName: "Ada Lovelace",
      status: "registered",
      email: null,
      detailsShared: false,
      profile: null,
      answers: [],
    });
  });

  it("falls back to the profile name, then the account name", () => {
    const noNames = {
      ...ROW.account,
      firstName: null,
      lastName: null,
    };
    expect(toAttendeeDetails({ ...ROW, account: noNames }).displayName).toBe(
      "Ada",
    );
    expect(
      toAttendeeDetails({ ...ROW, account: noNames, profile: null })
        .displayName,
    ).toBe("ada_l");
  });

  it("gives a waitlist place only to waitlisted rows", () => {
    expect(
      toAttendeeDetails({ ...ROW, status: "waitlisted", waitlistPosition: 2 })
        .waitlistPosition,
    ).toBe(2);
    expect(
      toAttendeeDetails({ ...ROW, status: "registered", waitlistPosition: 2 })
        .waitlistPosition,
    ).toBeNull();
  });
});
