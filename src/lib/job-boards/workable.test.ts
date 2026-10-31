import { describe, expect, it } from "vitest";
import fixture from "./fixtures/workable.json";
import {
  parseWorkableBoard,
  recognizeWorkableBoard,
  workableBoardUrl,
} from "./workable";

describe("Workable board addresses", () => {
  it.each([
    "https://apply.workable.com/careers/",
    "https://apply.workable.com/careers/j/A3269A621A/",
    "https://apply.workable.com/careers/j/A3269A621A/apply?source=community",
    "https://careers.workable.com/",
    "https://careers.workable.com/jobs/3949357",
    "https://careers.workable.com/jobs/3949357/candidates/new",
    "https://www.workable.com/api/accounts/careers?details=true",
    "https://apply.workable.com/api/v1/widget/accounts/careers?details=true",
  ])("recognizes %s", (address) =>
    expect(recognizeWorkableBoard(new URL(address))).toBe("careers"),
  );
  it.each([
    "http://apply.workable.com/careers",
    "https://workable.com/careers",
    "https://www.workable.com/",
    "https://apply.workable.com/",
    "https://apply.workable.com/j/A3269A621A",
    "https://apply.workable.com/careers/j/not-a-code",
    "https://apply.workable.com/careers/login",
    "https://apply.workable.com/api/v3/accounts/careers/jobs",
    "https://apply.workable.com/login",
    "https://careers.workable.com/auth",
    "https://careers.workable.com/jobs/1/candidates",
    "https://help.workable.com/",
    "https://jobs.workable.com/",
    "https://a.b.workable.com/",
    "https://apply.workable.com.evil.test/careers",
    "https://apply.workable.com/a%2Fb",
    "https://u:p@careers.workable.com/",
    "https://apply.workable.com:8443/careers",
  ])("leaves %s unrecognized", (address) =>
    expect(recognizeWorkableBoard(new URL(address))).toBeNull(),
  );
  it("builds the documented fixed-origin endpoint with descriptions", () => {
    expect(workableBoardUrl("careers")).toBe(
      "https://www.workable.com/api/accounts/careers?details=true",
    );
    expect(workableBoardUrl("a/b")).toContain("/a%2Fb?");
  });
});

const minimal = { title: "Engineer", url: "https://example.com/job" };
describe("parseWorkableBoard", () => {
  it("maps saved public postings with their calendar dates and correct application links", () => {
    expect(parseWorkableBoard(fixture)).toEqual([
      {
        title: "Product Manager",
        location: "Athens, Attica, Greece",
        department: "R&D",
        url: "https://apply.workable.com/j/A3269A621A",
        applyUrl: "https://apply.workable.com/j/A3269A621A/apply",
        employmentType: "Full-time",
        workplaceType: null,
        postedAt: "2026-10-27",
        description: null,
        descriptionTruncated: false,
      },
      {
        title: "Renewals Coordinator",
        location: "Athens, Greece",
        department: "Revenue",
        url: "https://apply.workable.com/j/94F9E30E22",
        applyUrl: "https://apply.workable.com/j/94F9E30E22/apply",
        employmentType: "Full-time",
        workplaceType: null,
        postedAt: "2026-10-06",
        description: null,
        descriptionTruncated: false,
      },
    ]);
  });
  it("keeps optional fields empty, excludes hidden locations and never invents a publication date", () => {
    expect(
      parseWorkableBoard({
        jobs: [
          {
            ...minimal,
            department: " ",
            created_at: "2026-10-01",
            locations: [{ city: "Secret office", hidden: true }],
          },
        ],
      }),
    ).toEqual([
      {
        title: "Engineer",
        url: "https://example.com/job",
        applyUrl: null,
        location: null,
        department: null,
        employmentType: null,
        workplaceType: null,
        postedAt: null,
        description: null,
        descriptionTruncated: false,
      },
    ]);
  });
  it("deduplicates flat location text and keeps HTML opaque for worker extraction", () => {
    expect(
      parseWorkableBoard({
        jobs: [
          {
            ...minimal,
            city: " Singapore ",
            state: "Singapore",
            country: "Singapore",
            description: "<p>Build things</p>",
          },
        ],
      })?.[0],
    ).toMatchObject({
      location: "Singapore",
      description: null,
      descriptionMarkup: { html: "<p>Build things</p>", encoded: false },
    });
  });
  it.each([
    ["on_site", true, "OnSite"],
    ["hybrid", false, "Hybrid"],
    ["remote", false, "Remote"],
    [null, true, "Remote"],
    [undefined, false, null],
    ["future-value", true, "future-value"],
  ])(
    "uses explicit workplace %s before legacy telecommuting=%s",
    (workplace_type, telecommuting, expected) => {
      expect(
        parseWorkableBoard({
          jobs: [{ ...minimal, workplace_type, telecommuting }],
        })?.[0]?.workplaceType,
      ).toBe(expected);
    },
  );
  it.each(["not a date", "2026-02-30", "2026-13-01"])(
    "drops invalid publication date %s",
    (published_on) => {
      expect(
        parseWorkableBoard({ jobs: [{ ...minimal, published_on }] })?.[0]
          ?.postedAt,
      ).toBeNull();
    },
  );
  it("normalizes full timestamps and refuses unsafe optional application links", () => {
    expect(
      parseWorkableBoard({
        jobs: [
          {
            ...minimal,
            published_on: "2026-10-27T12:00:00+02:00",
            application_url: "javascript:alert(1)",
          },
        ],
      })?.[0],
    ).toMatchObject({ postedAt: "2026-10-27T10:00:00.000Z", applyUrl: null });
  });
  it("distinguishes an empty board from malformed responses", () => {
    expect(parseWorkableBoard({ jobs: [] })).toEqual([]);
    for (const value of [
      null,
      {},
      [],
      { jobs: {} },
      { jobs: [null] },
      { jobs: [{ title: "Engineer", url: "javascript:bad" }] },
    ])
      expect(parseWorkableBoard(value)).toBeNull();
  });
});
