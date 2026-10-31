import { describe, expect, it } from "vitest";
import fixture from "./fixtures/lever.json";
import { leverBoardUrl, parseLeverBoard, recognizeLeverBoard } from "./lever";

const id = "ad208490-4052-4f91-a57e-433f2d1e484b";
describe("Lever board addresses", () => {
  it.each([
    ["https://jobs.lever.co/Acme", "lever"],
    [`https://jobs.lever.co/Acme/${id}/apply?source=community`, "lever"],
    [`https://jobs.eu.lever.co/Acme/${id}`, "lever-eu"],
    ["https://jobs.eu.lever.co/Acme/", "lever-eu"],
    ["https://api.lever.co/v0/postings/Acme?mode=json", "lever"],
    ["https://api.eu.lever.co/v0/postings/Acme/", "lever-eu"],
  ])("recognizes %s with its region and case intact", (address, board) => {
    expect(recognizeLeverBoard(new URL(address))).toEqual({
      name: "Acme",
      board,
    });
  });
  it.each([
    "http://jobs.lever.co/acme",
    "https://lever.co/acme",
    "https://jobs.lever.co.evil.test/acme",
    "https://jobs.lever.co/",
    "https://jobs.lever.co/acme/not-a-job",
    "https://jobs.lever.co/acme/jobs/1",
    "https://api.lever.co/v0/postings",
    "https://api.lever.co/v0/postings/acme/not-a-list",
    "https://jobs.lever.co/a%2Fb",
    "https://jobs.lever.co:8443/acme",
    "https://u:p@jobs.eu.lever.co/acme",
  ])("leaves %s unrecognized", (address) =>
    expect(recognizeLeverBoard(new URL(address))).toBeNull(),
  );
  it("builds fixed API hosts and bounded page queries", () => {
    expect(leverBoardUrl("Acme")).toBe(
      "https://api.lever.co/v0/postings/Acme?mode=json&limit=100&skip=0",
    );
    expect(leverBoardUrl("a/b", "lever-eu", 100)).toBe(
      "https://api.eu.lever.co/v0/postings/a%2Fb?mode=json&limit=100&skip=100",
    );
  });
});

describe("parseLeverBoard", () => {
  it("reads a real saved demo posting into common job fields without inventing a publication date", () => {
    expect(parseLeverBoard(fixture)).toEqual([
      {
        title: "Customer Success Manager",
        location: "Atlanta, Georgia",
        department: "Customer Success",
        url: `https://jobs.lever.co/leverdemo/${id}`,
        applyUrl: `https://jobs.lever.co/leverdemo/${id}/apply`,
        employmentType: "Regular Full Time (Salary)",
        workplaceType: "Hybrid",
        postedAt: null,
        description: null,
        descriptionTruncated: false,
      },
    ]);
  });
  it("composes all sections as opaque markup, escaping plaintext and preserving lists", () => {
    const job = parseLeverBoard([
      {
        text: "Engineer",
        hostedUrl: "https://example.com/job",
        descriptionPlain: "Build <tools> & learn",
        description: "<p>duplicate</p>",
        lists: [{ text: "Skills <required>", content: "<li>TypeScript</li>" }],
        additionalPlain: "Join us",
        salaryDescriptionPlain: "Pay details",
      },
    ])?.[0];
    expect(job?.descriptionMarkup).toEqual({
      encoded: false,
      html: "<div>Build &lt;tools&gt; &amp; learn</div>\n<section><h2>Skills &lt;required&gt;</h2><li>TypeScript</li></section>\n<div>Pay details</div>\n<div>Join us</div>",
    });
  });
  it("uses HTML fallbacks and source-specific optional fields safely", () => {
    const jobs = parseLeverBoard([
      {
        text: "Engineer",
        hostedUrl: "https://example.com/job",
        applyUrl: "javascript:alert(1)",
        descriptionPlain: " ",
        description: "<p>HTML</p>",
        additional: "<p>Closing</p>",
        categories: { team: "Research", commitment: " " },
        workplaceType: "unspecified",
      },
    ]);
    expect(jobs?.[0]).toMatchObject({
      department: "Research",
      location: null,
      applyUrl: null,
      workplaceType: null,
      employmentType: null,
      descriptionMarkup: { html: "<p>HTML</p>\n<p>Closing</p>" },
    });
  });
  it.each([
    ["remote", "Remote"],
    ["on-site", "OnSite"],
    ["new-kind", "new-kind"],
  ])("maps workplace %s", (source, expected) => {
    expect(
      parseLeverBoard([
        {
          text: "Engineer",
          hostedUrl: "https://example.com/job",
          workplaceType: source,
        },
      ])?.[0]?.workplaceType,
    ).toBe(expected);
  });
  it("distinguishes empty boards and broken responses", () => {
    expect(parseLeverBoard([])).toEqual([]);
    for (const value of [
      null,
      {},
      { jobs: [] },
      [null],
      [{ text: "Engineer", hostedUrl: "javascript:bad" }],
    ])
      expect(parseLeverBoard(value)).toBeNull();
  });
});
