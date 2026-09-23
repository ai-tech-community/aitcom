import { describe, expect, it } from "vitest";

import {
  detectJobBoardFromHtml,
  detectJobBoardFromUrl,
  extractJobPostingFromHtml,
  extractListingsFromCareersHtml,
  greenhouseTokenFromGhJid,
  htmlToPlainText,
  mergePostingIntoListing,
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

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

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
    expect(
      detectJobBoardFromHtml(
        '<a href="https://jobs.ashbyhq.com/mistral.ai">Mistral Jobs</a>',
      ),
    ).toEqual({ board: "ashby", token: "mistral.ai" });
    expect(
      greenhouseTokenFromGhJid(
        '<a href="/careers/job-details/?gh_jid=8622173002">DevOps Engineer</a>',
        "https://www.bigid.com/company/careers",
      ),
    ).toBe("bigid");
  });

  it("strips tags for sourced description text", () => {
    expect(htmlToPlainText("<p>Ship&nbsp;<strong>agents</strong>.</p>")).toBe(
      "Ship agents.",
    );
    expect(htmlToPlainText("Engineer &#8211; Remote &#038; hybrid")).toBe(
      "Engineer – Remote & hybrid",
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

  it("reads only this company's YC jobPostings and treats an empty list as no roles", () => {
    const board = extractListingsFromCareersHtml(
      `<div data-page="${escapeAttr(
        JSON.stringify({
          props: {
            jobPostings: [
              {
                id: 1,
                title: "Clinical Data Lead",
                url: "/companies/biostack-platforms/jobs/HIfysXu-clinical-data-lead",
                location: "San Francisco, CA, US",
                type: "Full-time",
              },
              {
                id: 2,
                title: "Other Company Engineer",
                url: "/companies/other-co/jobs/abc-engineer",
                location: "New York",
                type: "Full-time",
              },
            ],
          },
        }),
      )}"></div>
       <a href="/jobs/location/india">Jobs in India</a>`,
      "https://www.ycombinator.com/companies/biostack-platforms/jobs",
    );
    expect(board.map((row) => row.title)).toEqual(["Clinical Data Lead"]);
    expect(board[0]?.location).toBe("San Francisco, CA, US");

    const empty = extractListingsFromCareersHtml(
      `<div data-page="${escapeAttr(JSON.stringify({ props: { jobPostings: [] } }))}"></div>
       <a href="/jobs/location/india">Jobs in India</a>
       <a href="/companies/other-co/jobs/abc-engineer">Other Company Engineer</a>`,
      "https://www.ycombinator.com/companies/bite-ninja/jobs",
    );
    expect(empty).toEqual([]);
  });

  it("reads a Webflow rich-text job description and labeled location", () => {
    const posting = extractJobPostingFromHtml(
      `<h1>Team Leader iOS</h1>
       <img alt="Availability" class="position-detail__icon"/><div class="position-detail__text">Full time</div>
       <img alt="Location" class="position-detail__icon"/><div class="position-detail__text">Jerusalem</div>
       <div class="job-rich-text-block"><h3>Description</h3><div class="w-richtext"><p>If you have a strong background in iOS development, excellent leadership skills, and a passion for building innovative applications, we want to hear from you!</p></div></div>
       <div class="job-rich-text-block"><h3>The role</h3><div class="w-richtext"><ul><li>Lead and manage a team of iOS developers.</li></ul></div></div>`,
      "https://balink.net/job/team-leader-ios",
    );
    expect(posting?.title).toBe("Team Leader iOS");
    expect(posting?.location).toBe("Jerusalem");
    expect(posting?.workType).toBe("Full time");
    expect(posting?.descriptionText).toContain("strong background in iOS");
    expect(posting?.descriptionText).toContain("Lead and manage a team");
  });

  it("does not list the careers index as its own opening", () => {
    const listings = extractListingsFromCareersHtml(
      `<a href="https://getzoog.com/jobs/">Open Positions</a>
       <a href="https://getzoog.com/jobs/3d-artist/">3D Artist</a>`,
      "https://getzoog.com/jobs",
    );
    expect(listings.map((row) => row.sourceUrl)).toEqual([
      "https://getzoog.com/jobs/3d-artist/",
    ]);
  });

  it("reads the posting from visible sections when a menu is named description", () => {
    const posting = extractJobPostingFromHtml(
      `<header><div class="menu-item--with-description"><a>Products</a><div class="description">Everything leaders need to outperform the market.</div></div></header>
       <script type="application/ld+json">${JSON.stringify({
         "@type": "JobPosting",
         title: "Bookkeeper",
         url: "https://buildots.com/careers/CD.F64/",
         employmentType: "FULL_TIME",
         jobLocation: {
           "@type": "Place",
           address: { addressLocality: "Tel-Aviv" },
         },
       })}</script>
       <main>
         <h1>Bookkeeper</h1>
         <p>Tel-Aviv</p>
         <p>Open Positions</p>
         <p><strong>About the Role</strong></p>
         <p>We are looking for a detail-oriented Bookkeeper to join our finance team and keep the US and Canadian books current.</p>
         <p><strong>Key Responsibilities</strong></p>
         <ul><li>Manage Accounts Receivable and issue invoices.</li></ul>
         <p><strong>Requirements</strong></p>
         <ul><li>5+ years of bookkeeping experience in a Hi-Tech company.</li></ul>
         <p>Application form loading.</p>
         <p>See open positions</p>
       </main>`,
      "https://buildots.com/careers/CD.F64/",
    );
    expect(posting?.title).toBe("Bookkeeper");
    expect(posting?.location).toBe("Tel-Aviv");
    expect(posting?.workType).toBe("Full-time");
    expect(posting?.descriptionText).toContain("About the Role");
    expect(posting?.descriptionText).toContain("Manage Accounts Receivable");
    expect(posting?.descriptionText).toContain("5+ years of bookkeeping");
    expect(posting?.descriptionText).not.toContain("outperform the market");
    expect(posting?.descriptionText?.startsWith("About the Role")).toBe(true);
    expect(posting?.descriptionText).not.toContain("See open positions");
  });

  it("reads an Elementor theme post body", () => {
    const posting = extractJobPostingFromHtml(
      `<h1>Algorithms Engineer</h1>
       <div class="elementor-widget elementor-widget-theme-post-content">
         <div class="elementor-widget-container">
           <h2>Required Skills</h2>
           <ul><li>Thorough knowledge of C/C++, MATLAB and a scripting language such as Python for production computer vision.</li></ul>
         </div>
       </div>`,
      "https://augmind.me/jobs/algorithms-engineer/",
    );
    expect(posting?.title).toBe("Algorithms Engineer");
    expect(posting?.descriptionText).toContain("Thorough knowledge of C/C++");
  });

  it("reads a Framer Content region with location and job type", () => {
    const posting = extractJobPostingFromHtml(
      `<div data-framer-name="Title"><h1>AI Engineer (Junior)</h1></div>
       <div data-framer-name="Location"><p class="framer-text">Stellenbosch, Western Cape</p></div>
       <div><strong class="framer-text">Job Type:</strong></div>
       <p class="framer-text">Full-Time</p>
       <div data-framer-name="Content">
         <p class="framer-text"><strong>Who We Are</strong></p>
         <p class="framer-text">At Spatialedge, we deliver cutting-edge technical solutions for teams who want to ship reliable models.</p>
       </div>
       <p class="framer-text">Copyright footer that is not the posting.</p>`,
      "https://www.spatialedge.ai/careers/junior-ai-engineer",
    );
    expect(posting?.title).toBe("AI Engineer (Junior)");
    expect(posting?.location).toBe("Stellenbosch, Western Cape");
    expect(posting?.workType).toBe("Full-Time");
    expect(posting?.descriptionText).toContain(
      "cutting-edge technical solutions",
    );
    expect(posting?.descriptionText).not.toContain("Copyright footer");
  });

  it("reads a Work at a Startup posting from the page payload", () => {
    const posting = extractJobPostingFromHtml(
      `<div data-page="${escapeAttr(
        JSON.stringify({
          props: {
            job: {
              title: "Founding Research Engineer, RL/Reasoning",
              location: "San Francisco, CA, US",
              jobType: "Full-time",
              descriptionHtml:
                "<h2>About BioStack</h2><p>Source clinical datasets.</p>",
            },
          },
        }),
      )}"></div>`,
      "https://www.workatastartup.com/jobs/94045",
    );
    expect(posting?.title).toBe("Founding Research Engineer, RL/Reasoning");
    expect(posting?.descriptionText).toContain("About BioStack");
    expect(posting?.descriptionText).toContain("Source clinical datasets.");
    expect(posting?.workType).toBe("Full-time");
  });

  it("replaces a concatenated Apply now label with the posting title", () => {
    const merged = mergePostingIntoListing(
      {
        title: "Senior Data Scientist Data Science Remote Apply now",
        sourceUrl: "https://www.reveliolabs.com/careers/role",
        applyUrl: null,
        location: null,
        workType: null,
        descriptionText: null,
        externalId: null,
        board: "html",
      },
      {
        title: "Senior Data Scientist",
        location: "Remote",
        descriptionText:
          "Who we are: Revelio Labs provides workforce intelligence.",
        workType: "Full Time",
      },
    );
    expect(merged.title).toBe("Senior Data Scientist");
    expect(merged.descriptionText).toContain("workforce intelligence");
  });

  it("replaces a card label with the posting title", () => {
    const merged = mergePostingIntoListing(
      {
        title: "See position details",
        sourceUrl: "https://balink.net/job/cloud-architect",
        applyUrl: null,
        location: null,
        workType: null,
        descriptionText: null,
        externalId: null,
        board: "html",
      },
      {
        title: "Cloud Architect",
        location: null,
        descriptionText: null,
        workType: null,
      },
    );
    expect(merged.title).toBe("Cloud Architect");
    const card = mergePostingIntoListing(
      {
        title: "AI Engineer (Junior)\nStellenbosch\nMore Info",
        sourceUrl: "https://www.spatialedge.ai/careers/junior-ai-engineer",
        applyUrl: null,
        location: null,
        workType: null,
        descriptionText: null,
        externalId: null,
        board: "html",
      },
      {
        title: "AI Engineer (Junior)",
        location: "Stellenbosch",
        descriptionText: "Build models.",
        workType: "Full-Time",
      },
    );
    expect(card.title).toBe("AI Engineer (Junior)");
    expect(card.descriptionText).toBe("Build models.");
  });

  it("reads Rippling roles from the page payload", () => {
    const listings = extractListingsFromCareersHtml(
      `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            dehydratedState: {
              queries: [
                {
                  queryKey: ["board", "aalo-atomics", "job-posts"],
                  state: {
                    data: {
                      items: [
                        {
                          id: "8d4783fb",
                          name: "AI Platform Architect",
                          url: "https://ats.rippling.com/aalo-atomics/jobs/8d4783fb",
                          locations: [{ name: "Austin, TX" }],
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      })}</script>`,
      "https://ats.rippling.com/aalo-atomics/jobs",
    );
    expect(listings.map((row) => row.title)).toEqual(["AI Platform Architect"]);
    expect(listings[0]?.location).toBe("Austin, TX");
    expect(listings[0]?.sourceUrl).toBe(
      "https://ats.rippling.com/aalo-atomics/jobs/8d4783fb",
    );
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
    const sorted = applyStartupJobsQuery(
      [
        {
          ...filtered[0]!,
          id: "1",
          title: "Staff Engineer",
          location: "Toronto",
        },
        {
          id: "3",
          startupId: "a",
          startupSlug: "cursor-anysphere",
          startupName: "Cursor",
          startupLogoUrl: null,
          slug: "cursor-anysphere-advisor",
          title: "Advisor",
          location: "London",
          workType: null,
          sourceUrl: "https://cursor.com/careers/advisor",
          applyUrl: null,
          descriptionText: null,
          fetchedAt: "2026-09-20T00:00:00.000Z",
          board: "html",
          status: "open",
        },
      ],
      parseStartupJobsQuery({
        company: "cursor-anysphere",
        location: "London",
        sort: "role",
      }),
    );
    expect(sorted.map((row) => row.title)).toEqual(["Advisor"]);
    const byWorkType = applyStartupJobsQuery(sorted, {
      ...parseStartupJobsQuery({ workType: "Full-time" }),
      company: "",
    });
    expect(byWorkType).toHaveLength(0);
  });
});
