import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

import {
  csvCell,
  toAttendeesCsv,
  type AttendeeCsvLabels,
} from "./attendee-csv";
import type { AttendeeDetails } from "./attendee-details";

const LABELS: AttendeeCsvLabels = {
  name: "Name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  status: "Status",
  registeredAt: (tz) => `Registered at (${tz})`,
  waitlistPlace: "Waitlist place",
  paymentStatus: "Payment status",
  memberSince: "Member since",
  earlierEvents: "Earlier events attended",
  company: "Company",
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Website",
  experience: "Experience",
  skills: "Skills",
  interests: "Interests",
  statuses: {
    registered: "Registered",
    waitlisted: "Waitlist",
    pending_payment: "Awaiting payment",
    attended: "Checked in",
    cancelled: "Cancelled",
    payment_failed: "Payment failed",
  },
};

const ADA: AttendeeDetails = {
  registrationId: "r1",
  firstName: "Ada",
  lastName: "Lovelace",
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  detailsShared: true,
  status: "registered",
  registeredAt: new Date("2026-10-01T10:05:00Z"),
  waitlistPosition: null,
  paymentStatus: null,
  communityMemberSince: new Date("2026-01-15T23:30:00Z"),
  pastEventsAttended: 2,
  answers: [
    {
      questionId: "hope",
      question: "What do you hope to learn?",
      type: "long_text",
      value: "Ship an agent, then evals",
    },
    {
      questionId: "topics",
      question: "Topics",
      type: "multi_choice",
      value: ["RAG", "Agents"],
    },
  ],
  profile: {
    company: "Analytical Engines, Ltd",
    linkedinUrl: "https://linkedin.com/in/ada",
    githubUrl: null,
    websiteUrl: null,
    experienceLevel: "advanced",
    skills: ["math", "poetry"],
    interests: [],
  },
};

function parse(csv: string) {
  expect(csv.startsWith("﻿")).toBe(true);
  return csv.slice(1).trimEnd().split("\r\n");
}

describe("csvCell", () => {
  it("quotes commas, quotes, line breaks and edge spaces", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(" padded")).toBe('" padded"');
    expect(csvCell("plain")).toBe("plain");
  });

  it("keeps formula-looking text as text", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"',
    );
    expect(csvCell("+31 6 1234")).toBe("'+31 6 1234");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@me")).toBe("'@me");
  });

  it("writes numbers as numbers and nothing for empty values", () => {
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toAttendeesCsv", () => {
  it("writes a header and one line per attendee, in the event's time", () => {
    const [header, ada] = parse(
      toAttendeesCsv([ADA], {
        timezone: "Europe/Amsterdam",
        labels: LABELS,
      }),
    );
    expect(header).toBe(
      "Name,First name,Last name,Email,Status,Registered at (Europe/Amsterdam),Waitlist place,Payment status,Member since,Earlier events attended,Company,LinkedIn,GitHub,Website,Experience,Skills,Interests",
    );
    expect(ada).toBe(
      'Ada Lovelace,Ada,Lovelace,ada@example.com,Registered,2026-10-01 12:05,,,2026-01-16,2,"Analytical Engines, Ltd",https://linkedin.com/in/ada,,,advanced,math; poetry,',
    );
  });

  it("leaves email and profile empty where the read model withheld them", () => {
    const [, old] = parse(
      toAttendeesCsv(
        [
          {
            ...ADA,
            email: null,
            detailsShared: false,
            profile: null,
            status: "waitlisted",
            waitlistPosition: 3,
          },
        ],
        { timezone: "Europe/Amsterdam", labels: LABELS },
      ),
    );
    expect(old).toBe(
      "Ada Lovelace,Ada,Lovelace,,Waitlist,2026-10-01 12:05,3,,2026-01-16,2,,,,,,,",
    );
  });

  it("falls back to UTC for an event without a usable timezone", () => {
    const [header, ada] = parse(
      toAttendeesCsv([ADA], { timezone: null, labels: LABELS }),
    );
    expect(header).toContain("Registered at (UTC)");
    expect(ada).toContain("2026-10-01 10:05");
  });

  it("adds one column per question, in the event's order", () => {
    const [header, ada] = parse(
      toAttendeesCsv([ADA, { ...ADA, registrationId: "r2", answers: [] }], {
        timezone: "UTC",
        labels: LABELS,
        questions: [
          { id: "topics", label: "Topics" },
          { id: "diet", label: "Dietary needs" },
          { id: "hope", label: "What do you hope to learn?" },
        ],
      }),
    );
    expect(header).toMatch(
      /,Interests,Topics,Dietary needs,What do you hope to learn\?$/,
    );
    expect(ada).toMatch(/,RAG; Agents,,"Ship an agent, then evals"$/);
  });

  it("writes only the header for an empty list", () => {
    expect(
      parse(toAttendeesCsv([], { timezone: "UTC", labels: LABELS })),
    ).toHaveLength(1);
  });
});
