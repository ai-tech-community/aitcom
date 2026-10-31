import { describe, expect, it } from "vitest";

import fixture from "./fixtures/ashby.json";
import { ashbyBoardUrl, parseAshbyBoard, recognizeAshbyBoard } from "./ashby";

const id = "7458d4e9-da2e-47bd-98cb-adfda43d42b2";

describe("Ashby board addresses", () => {
  it.each([
    "https://jobs.ashbyhq.com/Ashby",
    "https://jobs.ashbyhq.com/Ashby/",
    `https://jobs.ashbyhq.com/Ashby/${id}?source=community`,
    `https://jobs.ashbyhq.com/Ashby/${id}/application`,
    "https://api.ashbyhq.com/posting-api/job-board/Ashby?includeCompensation=true",
  ])("recognises %s without changing the board name's case", (address) => {
    expect(recognizeAshbyBoard(new URL(address))).toBe("Ashby");
  });

  it.each([
    "http://jobs.ashbyhq.com/Ashby",
    "https://ashbyhq.com/Ashby",
    "https://jobs.ashbyhq.com.evil.example/Ashby",
    "https://api.ashbyhq.com/Ashby",
    "https://api.ashbyhq.com/posting-api/job-board",
    "https://api.ashbyhq.com/posting-api/job-board/Ashby/jobs",
    "https://jobs.ashbyhq.com/",
    "https://jobs.ashbyhq.com/Ashby/not-a-job",
    "https://jobs.ashbyhq.com/Ashby/jobs/1",
    "https://jobs.ashbyhq.com/a%2Fb",
    "https://user:pass@jobs.ashbyhq.com/Ashby",
    "https://jobs.ashbyhq.com:8443/Ashby",
  ])("leaves %s unrecognised", (address) => {
    expect(recognizeAshbyBoard(new URL(address))).toBeNull();
  });

  it("builds the same public API address used by the startup scanner", () => {
    expect(ashbyBoardUrl("Ashby")).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/Ashby",
    );
    expect(ashbyBoardUrl("a/b")).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/a%2Fb",
    );
  });
});

describe("parseAshbyBoard", () => {
  it("keeps source types, refuses unsafe application links, and never infers remote from isRemote", () => {
    const parse = (applyUrl: unknown) =>
      parseAshbyBoard({
        jobs: [
          {
            title: "Engineer",
            jobUrl: "https://example.com/job",
            applyUrl,
            isRemote: true,
            employmentType: "Something new",
            descriptionPlain: "x".repeat(100001),
          },
        ],
      })?.[0];
    for (const url of [
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "/apply",
      null,
    ])
      expect(parse(url)?.applyUrl).toBeNull();
    expect(parse("https://example.com/apply")).toMatchObject({
      employmentType: "Something new",
      workplaceType: null,
      descriptionTruncated: true,
    });
    expect(parse(null)?.description).toHaveLength(100000);
  });

  it("reads a saved public response into the shared job columns", () => {
    expect(parseAshbyBoard(fixture)).toEqual([
      {
        title: "Engineering Manager - EU",
        location: "Remote - European Union",
        department: "Engineering",
        url: `https://jobs.ashbyhq.com/Ashby/${id}`,
        postedAt: "2024-03-04T14:29:08.532Z",
        description: null,
        applyUrl: `https://jobs.ashbyhq.com/Ashby/${id}/application`,
        employmentType: null,
        workplaceType: null,
        descriptionTruncated: false,
      },
      {
        title: "Mid Market Account Executive - EMEA (French Speaking)",
        location: "France",
        department: "Sales",
        url: "https://jobs.ashbyhq.com/Ashby/86a60834-ba64-484d-9658-afa1bc97a957",
        postedAt: "2026-09-08T16:27:26.694Z",
        description: null,
        applyUrl:
          "https://jobs.ashbyhq.com/Ashby/86a60834-ba64-484d-9658-afa1bc97a957/application",
        employmentType: null,
        workplaceType: null,
        descriptionTruncated: false,
      },
    ]);
  });

  it("omits unlisted entries before validating the fields only displayed jobs need", () => {
    expect(
      parseAshbyBoard({
        jobs: [
          { isListed: false },
          {
            title: "Engineer",
            jobUrl: "https://example.com/job/1",
            isListed: true,
          },
        ],
      }),
    ).toEqual([
      {
        title: "Engineer",
        location: null,
        department: null,
        url: "https://example.com/job/1",
        postedAt: null,
        description: null,
        applyUrl: null,
        employmentType: null,
        workplaceType: null,
        descriptionTruncated: false,
      },
    ]);
  });

  it("keeps optional values empty and ignores update dates", () => {
    expect(
      parseAshbyBoard({
        jobs: [
          {
            title: "Engineer",
            jobUrl: "https://example.com/job/1",
            location: "  ",
            department: null,
            updatedAt: "2026-10-31T12:00:00Z",
            publishedAt: "not a date",
          },
        ],
      }),
    ).toEqual([
      {
        title: "Engineer",
        location: null,
        department: null,
        url: "https://example.com/job/1",
        postedAt: null,
        description: null,
        applyUrl: null,
        employmentType: null,
        workplaceType: null,
        descriptionTruncated: false,
      },
    ]);
  });

  it("distinguishes an empty or wholly unlisted board from an invalid response", () => {
    expect(parseAshbyBoard({ jobs: [] })).toEqual([]);
    expect(parseAshbyBoard({ jobs: [{ isListed: false }] })).toEqual([]);
    for (const payload of [
      null,
      {},
      { jobs: {} },
      { jobs: [null] },
      { jobs: [{ title: "Engineer", jobUrl: "javascript:alert(1)" }] },
    ]) {
      expect(parseAshbyBoard(payload)).toBeNull();
    }
  });
});
