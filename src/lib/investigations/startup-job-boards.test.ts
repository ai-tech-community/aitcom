import { describe, expect, it } from "vitest";

import {
  detectJobBoardFromHtml,
  detectJobBoardFromUrl,
  extractJobPostingFromHtml,
  extractListingsFromCareersHtml,
  htmlToPlainText,
  parseAshbyJobs,
  parseGreenhouseJobs,
  parseLeverJobs,
  parseWorkableJobs,
} from "./startup-job-boards";
import {
  allocateStartupRoleSlug,
  applyStartupJobsQuery,
  parseStartupJobsQuery,
  startupRoleSitemapPaths,
  startupRoleSlugFromTitle,
} from "./startup-roles";

describe("detectJobBoardFromUrl", () => {
  it("recognises Ashby, Greenhouse, Lever, and Workable boards", () => {
    expect(detectJobBoardFromUrl("https://jobs.ashbyhq.com/skildai")).toEqual({
      board: "ashby",
      token: "skildai",
    });
    expect(
      detectJobBoardFromUrl("https://boards.greenhouse.io/anthropic"),
    ).toEqual({ board: "greenhouse", token: "anthropic" });
    expect(
      detectJobBoardFromUrl(
        "https://boards.greenhouse.io/embed/job_board?for=cursor",
      ),
    ).toEqual({ board: "greenhouse", token: "cursor" });
    expect(detectJobBoardFromUrl("https://jobs.lever.co/figure")).toEqual({
      board: "lever",
      token: "figure",
    });
    expect(
      detectJobBoardFromUrl("https://apply.workable.com/example/"),
    ).toEqual({ board: "workable", token: "example" });
    expect(detectJobBoardFromUrl("https://cursor.com/careers")).toEqual({
      board: "unknown",
      token: null,
    });
  });
});

describe("ATS JSON parsers", () => {
  it("parses Greenhouse jobs without inventing titles", () => {
    const listings = parseGreenhouseJobs({
      jobs: [
        {
          id: 1,
          title: "Research Engineer",
          absolute_url: "https://boards.greenhouse.io/anthropic/jobs/1",
          location: { name: "San Francisco" },
          content: "<p>Ship models.</p>",
        },
        { id: 2, title: "  ", absolute_url: "https://example.com/x" },
      ],
    });
    expect(listings).toHaveLength(1);
    expect(listings[0]?.title).toBe("Research Engineer");
    expect(listings[0]?.location).toBe("San Francisco");
    expect(listings[0]?.board).toBe("greenhouse");
  });

  it("parses Ashby and Lever payloads", () => {
    expect(
      parseAshbyJobs({
        jobs: [
          {
            id: "abc",
            title: "Forward Deployed Engineer",
            jobUrl: "https://jobs.ashbyhq.com/skildai/abc",
            locationName: "Remote",
          },
        ],
      })[0]?.title,
    ).toBe("Forward Deployed Engineer");
    expect(
      parseLeverJobs([
        {
          id: "z",
          text: "Hardware intern",
          hostedUrl: "https://jobs.lever.co/figure/z",
          categories: { location: "Sunnyvale", commitment: "Internship" },
        },
      ])[0]?.workType,
    ).toBe("Internship");
    expect(
      parseWorkableJobs({
        jobs: [
          {
            title: "Ops lead",
            url: "https://apply.workable.com/example/j/1",
            shortcode: "1",
          },
        ],
      }),
    ).toHaveLength(1);
  });
});

describe("HTML extract", () => {
  it("reads JSON-LD JobPosting and job anchors, never Careers chrome", () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"JobPosting","title":"Staff Engineer","url":"https://cursor.com/careers/staff","description":"<p>Build the editor.</p>"}
      </script>
      <a href="/careers">Careers</a>
      <a href="/careers/staff-designer">Staff Designer</a>
    `;
    const listings = extractListingsFromCareersHtml(
      html,
      "https://cursor.com/careers",
    );
    expect(listings.map((row) => row.title)).toEqual(["Staff Engineer"]);
    const anchors = extractListingsFromCareersHtml(
      `<a href="/jobs/platform-engineer">Platform Engineer</a><a href="/careers">Careers</a>`,
      "https://example.com/careers",
    );
    expect(anchors.map((row) => row.title)).toEqual(["Platform Engineer"]);
  });

  it("detects an embedded Ashby board in custom careers HTML", () => {
    expect(
      detectJobBoardFromHtml(
        '<iframe src="https://jobs.ashbyhq.com/physicalintelligence"></iframe>',
      ),
    ).toEqual({ board: "ashby", token: "physicalintelligence" });
  });

  it("strips tags for sourced description text", () => {
    expect(htmlToPlainText("<p>Ship&nbsp;<strong>agents</strong>.</p>")).toBe(
      "Ship agents.",
    );
    expect(
      extractJobPostingFromHtml(
        "<h1>Designer</h1><article><p>Figma.</p></article>",
        "https://example.com/jobs/designer",
      )?.title,
    ).toBe("Designer");
  });
});

describe("startup role slugs and jobs query", () => {
  it("prefixes role slugs with the company slug", () => {
    expect(startupRoleSlugFromTitle("cursor-anysphere", "Staff Engineer")).toBe(
      "cursor-anysphere-staff-engineer",
    );
    expect(
      allocateStartupRoleSlug("cursor-anysphere", "Staff Engineer", [
        "cursor-anysphere-staff-engineer",
      ]),
    ).toBe("cursor-anysphere-staff-engineer-2");
    expect(
      startupRoleSitemapPaths([
        "cursor-anysphere-staff-engineer",
        "not a slug",
      ]),
    ).toEqual(["/jobs/cursor-anysphere-staff-engineer"]);
  });

  it("plain-texts entity-escaped HTML instead of leaving tags in the JD", () => {
    expect(
      htmlToPlainText("&lt;p&gt;Ship models in San Francisco.&lt;/p&gt;"),
    ).toBe("Ship models in San Francisco.");
  });

  it("skips careers-index CTA titles", () => {
    const listings = extractListingsFromCareersHtml(
      `<a href="/careers/jobs">Explore open roles</a>
       <a href="/careers/research-engineer">Research Engineer</a>`,
      "https://www.anthropic.com/careers",
    );
    expect(listings.map((row) => row.title)).toEqual(["Research Engineer"]);
  });

  it("reads a YC board from embedded job JSON instead of the apply button", () => {
    const listings = extractListingsFromCareersHtml(
      `<a href="/companies/biostack-platforms/jobs/HIfysXu-clinical-data-lead">[View Position &amp; Apply →]</a>
       <a href="https://account.ycombinator.com/authenticate?continue=https://www.workatastartup.com/application">Apply Now</a>
       &quot;title&quot;:&quot;Clinical Data Lead&quot;,&quot;url&quot;:&quot;/companies/biostack-platforms/jobs/HIfysXu-clinical-data-lead&quot;,&quot;location&quot;:&quot;San Francisco, CA, US&quot;,&quot;type&quot;:&quot;Full-time&quot;`,
      "https://www.ycombinator.com/companies/biostack-platforms/jobs",
    );
    expect(listings.map((row) => row.title)).toEqual(["Clinical Data Lead"]);
    expect(listings[0]?.location).toBe("San Francisco, CA, US");
    expect(listings[0]?.workType).toBe("Full-time");
    expect(listings[0]?.sourceUrl).toBe(
      "https://www.ycombinator.com/companies/biostack-platforms/jobs/HIfysXu-clinical-data-lead",
    );
  });

  it("skips location/category index titles such as Jobs in Chicago", () => {
    const listings = extractListingsFromCareersHtml(
      `<a href="/jobs/jobs-in-india">Jobs in India</a>
       <a href="/jobs/software-engineer-jobs-in-new-york">Software Engineer Jobs in New York</a>
       <a href="/jobs/product-manager-jobs-in-san-francisco">Product Manager Jobs in San Francisco</a>
       <a href="/jobs/platform-engineer">Platform Engineer</a>`,
      "https://www.ycombinator.com/companies/bite-ninja/jobs",
    );
    expect(listings.map((row) => row.title)).toEqual(["Platform Engineer"]);
  });

  it("filters the public jobs table by company slug", () => {
    const query = parseStartupJobsQuery({
      company: "cursor-anysphere",
      page: "2",
    });
    expect(query.company).toBe("cursor-anysphere");
    expect(query.page).toBe(2);
    const filtered = applyStartupJobsQuery(
      [
        {
          id: "1",
          startupId: "a",
          startupSlug: "cursor-anysphere",
          startupName: "Cursor",
          startupLogoUrl: null,
          slug: "cursor-anysphere-staff",
          title: "Staff Engineer",
          location: null,
          workType: null,
          sourceUrl: "https://cursor.com/careers/staff",
          applyUrl: null,
          descriptionText: null,
          fetchedAt: "2026-09-20T00:00:00.000Z",
          board: "html",
          status: "open",
        },
        {
          id: "2",
          startupId: "b",
          startupSlug: "anthropic",
          startupName: "Anthropic",
          startupLogoUrl: null,
          slug: "anthropic-research",
          title: "Research Engineer",
          location: null,
          workType: null,
          sourceUrl: "https://anthropic.com/careers/research",
          applyUrl: null,
          descriptionText: null,
          fetchedAt: "2026-09-20T00:00:00.000Z",
          board: "html",
          status: "open",
        },
      ],
      query,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.startupSlug).toBe("cursor-anysphere");
  });
});
