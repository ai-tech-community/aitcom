import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  detectJobBoardFromHtml,
  detectJobBoardFromUrl,
  extractJobPostingFromHtml,
  extractListingsFromCareersHtml,
  greenhouseTokenFromGhJid,
  htmlToPlainText,
  isPublishableJobTitle,
  mergePostingIntoListing,
  normalizeStartupJobUrl,
  parseAshbyJobs,
  parseGreenhouseJobs,
  parseLeverJobs,
  parseWorkableJobs,
} from "./startup-job-boards";
import {
  STARTUP_ROLE_SLUG_MAX,
  allocateStartupRoleSlug,
  applyStartupJobsQuery,
  parseStartupJobsQuery,
  startupRoleSitemapPaths,
  startupRoleSlugFromTitle,
} from "./startup-roles";
import { parseStartupSlug } from "./startups";

/** Title whose 80-char role slug is cut on a hyphen when `-2` is appended. */
function titleThatCutsSlugOnHyphen(company: string): string {
  const roleLength = STARTUP_ROLE_SLUG_MAX - company.length - 1;
  const hyphenAt = STARTUP_ROLE_SLUG_MAX - 3 - (company.length + 1);
  if (hyphenAt < 1 || hyphenAt > roleLength - 3) {
    throw new Error(`${company} does not truncate on a hyphen`);
  }
  return `${"a".repeat(hyphenAt)}-bc`;
}

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

  it("keeps a real ATS publish date and ignores crawl timestamps", () => {
    expect(
      parseAshbyJobs({
        jobs: [
          {
            id: "abc",
            title: "Forward Deployed Engineer",
            jobUrl: "https://jobs.ashbyhq.com/skildai/abc",
            locationName: "San Francisco, CA",
            employmentType: "FullTime",
            publishedAt: "2026-03-01T17:29:00.000Z",
            updatedAt: "2026-09-20T00:00:00.000Z",
          },
        ],
      })[0]?.postedAt,
    ).toBe("2026-03-01");
    expect(
      parseGreenhouseJobs({
        jobs: [
          {
            id: 1,
            title: "Research Engineer",
            absolute_url: "https://boards.greenhouse.io/anthropic/jobs/1",
            updated_at: "2026-09-20T00:00:00.000Z",
            location: { name: "San Francisco" },
          },
        ],
      })[0]?.postedAt,
    ).toBeNull();
    expect(
      parseGreenhouseJobs({
        jobs: [
          {
            id: 1,
            title: "Research Engineer",
            absolute_url: "https://boards.greenhouse.io/anthropic/jobs/1",
            first_published: "2026-02-11T08:00:00-08:00",
            updated_at: "2026-09-20T00:00:00.000Z",
          },
        ],
      })[0]?.postedAt,
    ).toBe("2026-02-11");
    expect(
      parseLeverJobs([
        {
          id: "z",
          text: "Hardware intern",
          hostedUrl: "https://jobs.lever.co/figure/z",
          createdAt: 1760000000000,
          categories: { location: "Sunnyvale" },
        },
      ])[0]?.postedAt,
    ).toBeNull();
    expect(
      parseWorkableJobs({
        jobs: [
          {
            title: "Ops lead",
            url: "https://apply.workable.com/example/j/1",
            shortcode: "1",
            published_on: "2026-01-15",
            created_at: "2026-09-20T00:00:00.000Z",
          },
        ],
      })[0]?.postedAt,
    ).toBe("2026-01-15");
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
    expect(
      parseWorkableJobs({
        jobs: [
          {
            title: "Installation Technician",
            url: "https://apply.workable.com/j/0FD18F627F",
            shortcode: "0FD18F627F",
          },
          {
            title: "Installation Technician",
            url: "https://apply.workable.com/j/0FD18F627F",
            shortcode: "0FD18F627F",
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

  it("reads datePosted from JobPosting JSON-LD and ignores fetched times", () => {
    const listings = extractListingsFromCareersHtml(
      `<script type="application/ld+json">
        {"@type":"JobPosting","title":"Staff Engineer","datePosted":"2026-03-01","url":"https://cursor.com/careers/staff","description":"<p>Build the editor.</p>"}
      </script>`,
      "https://cursor.com/careers",
    );
    expect(listings[0]?.postedAt).toBe("2026-03-01");
    const undated = extractJobPostingFromHtml(
      `<script type="application/ld+json">
        {"@type":"JobPosting","title":"Staff Engineer","url":"https://cursor.com/careers/staff","description":"<p>Build the editor.</p>"}
      </script>`,
      "https://cursor.com/careers/staff",
    );
    expect(undated?.postedAt ?? null).toBeNull();
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

  it.each(["legion-health", "agent-interactive-network-ltd"])(
    "does not allocate a --N slug when %s truncates on a hyphen",
    (company) => {
      const title = titleThatCutsSlugOnHyphen(company);
      const base = startupRoleSlugFromTitle(company, title);
      expect(base).toHaveLength(STARTUP_ROLE_SLUG_MAX);
      expect(base[STARTUP_ROLE_SLUG_MAX - 3]).toBe("-");
      const stored = `${base.slice(0, STARTUP_ROLE_SLUG_MAX - 2)}-2`;
      expect(stored.endsWith("--2")).toBe(true);
      expect(parseStartupSlug(stored)).toBeNull();

      const slug = allocateStartupRoleSlug(company, title, [base, stored]);
      expect(slug).not.toBe(stored);
      expect(slug.endsWith("-2")).toBe(true);
      expect(slug.includes("--")).toBe(false);
      expect(parseStartupSlug(slug)).toBe(slug);

      const next = allocateStartupRoleSlug(company, title, [
        base,
        stored,
        slug,
      ]);
      expect(next).not.toBe(stored);
      expect(next).not.toBe(slug);
      expect(parseStartupSlug(next)).toBe(next);
    },
  );

  it("strips NUL and other scalars Postgres text rejects from HTML", () => {
    expect(htmlToPlainText("Grow\u0000 crops in the field.")).toBe(
      "Grow crops in the field.",
    );
    expect(htmlToPlainText("<p>Grow&#0; crops</p>")).toBe("Grow crops");
    expect(htmlToPlainText("<p>Grow&#x0; crops</p>")).toBe("Grow crops");
    expect(htmlToPlainText("<p>Grow&#xD800; crops</p>")).toBe("Grow crops");
    expect(htmlToPlainText("<p>Grow&#x110000; crops</p>")).toBe("Grow crops");
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
        postedAt: null,
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
        postedAt: null,
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
        postedAt: null,
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
      null,
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
      null,
    );
    expect(sorted.map((row) => row.title)).toEqual(["Advisor"]);
    const byWorkType = applyStartupJobsQuery(
      sorted,
      {
        ...parseStartupJobsQuery({ workType: "Full-time" }),
        company: "",
      },
      null,
    );
    expect(byWorkType).toHaveLength(0);
  });
});

const GINMON_JOBS_FIXTURE = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/ginmon-careers-jobs.html",
  ),
  "utf8",
);

/**
 * Card headings on https://www.ginmon.de/careers/jobs, captured 2026-09-27.
 * The first h4 includes the trailing token "Ginmon" as published on the board.
 */
const GINMON_LIVE_TITLES = [
  "Product Manager (m/w/d) – Wealth Management Platform Ginmon",
  "Product Manager (m/w/d) – Digital Wealth Management (apeiron)",
  "Business Development Representative (m/w/d)",
  "Werkstudent Finance & Controlling (m/w/d)",
  "Initiativbewerbung – Finanzen | IT | Fintech | Asset Management (m/w/d)",
  "Working Student Software Engineering (m/f/d)",
] as const;

describe("board titles are not jobs", () => {
  it("rejects listing H1s and generic board labels", () => {
    for (const title of [
      "Offene Stellen",
      "Offene Positionen",
      "Stellenangebote",
      "Aktuelle Stellen",
      "Ab sofort suchen wir",
      "Open Positions",
      "Current openings",
      "We are now looking for",
      "We're hiring",
      "Vacatures",
    ]) {
      expect(isPublishableJobTitle(title)).toBe(false);
    }
    expect(
      isPublishableJobTitle("Working Student Software Engineering (m/f/d)"),
    ).toBe(true);
    expect(
      isPublishableJobTitle(
        "Product Manager (m/w/d) – Wealth Management Platform Ginmon",
      ),
    ).toBe(true);

    expect(
      extractJobPostingFromHtml(
        "<h1>Offene Stellen</h1><p>Ab sofort suchen wir</p>",
        "https://www.ginmon.de/careers/jobs",
      ),
    ).toBeNull();
    expect(
      extractJobPostingFromHtml(
        "<h1>We are now looking for</h1>",
        "https://www.ginmon.de/en/careers/jobs",
      ),
    ).toBeNull();
    expect(
      extractJobPostingFromHtml(
        "<h1>Team Leader iOS</h1><article><p>Lead the iOS team and ship the next release of the wallet.</p></article>",
        "https://example.com/jobs/team-leader-ios",
      )?.title,
    ).toBe("Team Leader iOS");
  });

  it("does not treat a jobs-index CTA as an opening", () => {
    const listings = extractListingsFromCareersHtml(
      `<h1>Werde Teil unseres Teams</h1>
       <a href="./careers/jobs"><p>Offene Stellen</p></a>
       <a href="/en/careers/jobs">Zu den Jobs</a>
       <a href="/karriere/stellen">Stellenangebote</a>`,
      "https://www.ginmon.de/careers",
    );
    expect(listings).toEqual([]);
  });

  it("reads Ginmon Recruitee cards and drops the board headline", () => {
    const listings = extractListingsFromCareersHtml(
      GINMON_JOBS_FIXTURE,
      "https://www.ginmon.de/careers/jobs",
    );
    expect(listings.map((row) => row.title)).toEqual([...GINMON_LIVE_TITLES]);
    expect(listings.map((row) => row.sourceUrl)).toEqual([
      "https://ginmon.recruitee.com/o/product-manager-mwd-wealth-management-platform-ginmon",
      "https://ginmon.recruitee.com/o/product-manager-mwd-digital-wealth-management-apeiron",
      "https://ginmon.recruitee.com/o/business-development-representative-mwd",
      "https://ginmon.recruitee.com/o/werkstudent-finance-controlling-mwd",
      "https://ginmon.recruitee.com/o/initiativbewerbung-finanzen-it-fintech-asset-management-mwd",
      "https://ginmon.recruitee.com/o/working-student-software-engineering-mfd",
    ]);
    expect(
      listings.every(
        (row) => row.location === "Frankfurt am Main, Hessen, Deutschland",
      ),
    ).toBe(true);
    expect(listings.map((row) => row.title)).not.toContain("Offene Stellen");
    expect(listings.map((row) => row.title)).not.toContain(
      "Ab sofort suchen wir",
    );
    expect(listings.map((row) => row.title)).not.toContain(
      "WealthTech Solutions",
    );
    expect(listings.map((row) => row.title)).not.toContain("IT");
  });
});

const LANDEED_YC_FIXTURE = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/landeed-yc-jobs.html",
  ),
  "utf8",
);

describe("8 Oct 2026 jobs refresh title junk", () => {
  it("rejects link text that is not a role and keeps real one-word roles", () => {
    for (const title of [
      "See all positions",
      "View Open Positions",
      "View the Staff Engineer role",
      "16",
      "2",
      "Engineering",
      "People",
      "Business",
      "Product",
      "Marketing",
      "Other",
    ]) {
      expect(isPublishableJobTitle(title)).toBe(false);
    }
    // Accountant is a live Landeed YC posting. Designer is an existing one-word role.
    expect(isPublishableJobTitle("Accountant")).toBe(true);
    expect(isPublishableJobTitle("Designer")).toBe(true);
    expect(isPublishableJobTitle("AI Team Lead")).toBe(true);
    expect(isPublishableJobTitle("HRBP (Director)")).toBe(true);
    expect(
      isPublishableJobTitle("People & Operations Associate (HR & Admin)"),
    ).toBe(true);
    expect(isPublishableJobTitle("Product Operations Manager")).toBe(true);
  });

  it("rejects link text and city labels, and reads the role out of an h6 card", () => {
    for (const title of [
      "View Job",
      "view job",
      "Details",
      "MORE",
      "More Details",
      "View Details",
      "View Posting",
      "See Position",
      "Job Details",
      "Apply Here",
      "Open",
      "FAQ",
      "Share",
      "Ghent",
      "Dubai",
      "London",
      "London / Ghent",
      "United States · India ·",
    ]) {
      expect(isPublishableJobTitle(title)).toBe(false);
    }
    expect(isPublishableJobTitle("Open Source Engineer")).toBe(true);
    expect(isPublishableJobTitle("SharePoint Administrator")).toBe(true);
    expect(isPublishableJobTitle("Commercial Growth Manager")).toBe(true);
    expect(isPublishableJobTitle("Team Lead, Canada")).toBe(true);
    expect(isPublishableJobTitle("Enterprise BDR – Chicago")).toBe(true);

    const listings = extractListingsFromCareersHtml(
      `<a href="https://legalfly.recruitee.com/o/senior-account-executive-uae-dubai">
         <h6>Senior Account Executive UAE</h6>
         <p>Dubai</p>
       </a>
       <a href="https://legalfly.recruitee.com/o/customer-success-manager-be-1">
         <h6>Customer Success Manager BE</h6>
         <p>Ghent</p>
       </a>`,
      "https://www.legalfly.com/careers",
    );
    expect(listings.map((row) => row.title)).toEqual([
      "Senior Account Executive UAE",
      "Customer Success Manager BE",
    ]);
    expect(listings.map((row) => row.location)).toEqual(["Dubai", "Ghent"]);
  });

  it("treats tracking, www, and a trailing slash as the same posting URL", () => {
    expect(
      normalizeStartupJobUrl(
        "https://www.comeet.com/jobs/lumus/62.00F/quality-engineer/7B.D67?coref=1.8&amp;1788436470111",
      ),
    ).toBe("https://comeet.com/jobs/lumus/62.00F/quality-engineer/7B.D67");
    expect(
      normalizeStartupJobUrl(
        "https://boards.greenhouse.io/acme/jobs/1?gh_jid=99",
      ),
    ).toBe("https://boards.greenhouse.io/acme/jobs/1?gh_jid=99");
  });

  it("drops Comeet department indexes and pagination numbers", () => {
    const firmus = extractListingsFromCareersHtml(
      `<a href="https://firmus.ai/careers/co/engineering/all">Engineering</a>
       <a href="//firmus.ai/careers/co/tel-aviv/27.074/ai-team-lead/all">AI Team Lead</a>
       <a href="//firmus.ai/careers/co/tel-aviv/17.07F/ml-research/all">ML Research</a>`,
      "https://firmus.ai/careers/",
    );
    expect(firmus.map((row) => row.title)).toEqual([
      "AI Team Lead",
      "ML Research",
    ]);

    const aman = extractListingsFromCareersHtml(
      `<a href="https://www.aman.co.il/careers/page/16/">16</a>
       <a href="https://www.aman.co.il/careers/bi-big-data-dba/data-engineer-4/">Data Engineer</a>`,
      "https://www.aman.co.il/careers/",
    );
    expect(aman.map((row) => row.title)).toEqual(["Data Engineer"]);

    const superwise = extractListingsFromCareersHtml(
      `<a href="/careers/staff-engineer/">View the Staff Engineer role</a>
       <a href="#openings">View Open Positions</a>`,
      "https://superwise.ai/careers/",
    );
    expect(superwise).toEqual([]);
  });

  it("reads the role heading on Natural Intelligence cards, not the department", () => {
    const listings = extractListingsFromCareersHtml(
      `<a href="//www.naturalint.com/jobs/co/tel-aviv/85.F6F/hrbp-director/all" class="item people">
         <h3 class="item-cat">People</h3>
         <h2 class="item-title">HRBP (Director)</h2>
       </a>
       <a href="//www.naturalint.com/jobs/co/tel-aviv/43.F61/business-development-manager/all" class="item business">
         <h3 class="item-cat">Business</h3>
         <h2 class="item-title">Business Development Manager</h2>
       </a>
       <a href="//www.naturalint.com/jobs/co/tel-aviv/DE.275/product-operations-manager/all" class="item product">
         <h3 class="item-cat">Product</h3>
         <h2 class="item-title">Product Operations Manager</h2>
       </a>`,
      "https://www.naturalint.com/jobs/",
    );
    expect(listings.map((row) => row.title)).toEqual([
      "HRBP (Director)",
      "Business Development Manager",
      "Product Operations Manager",
    ]);
  });

  it("stores the ohm-2 role as the title and the place as the location", () => {
    const listings = extractListingsFromCareersHtml(
      `<a href="https://www.ycombinator.com/companies/ohm-2/jobs/jn6BlBR-founding-account-executive">
         <p>Founding Account Executive</p>
         <p>San Francisco, CA · Hybrid</p>
         <span>Apply</span>
       </a>
       <a href="https://www.ycombinator.com/companies/ohm-2/jobs/OOZ8aTx-chief-of-staff">
         <p>Chief of Staff</p>
         <p>San Francisco, CA / Remote (London, UK)</p>
         <span>Apply</span>
       </a>
       <a href="https://www.ycombinator.com/companies/ohm-2/jobs/rF5JtAx-full-stack-engineer">
         <p>Full Stack Engineer</p>
         <p>San Francisco, CA · Onsite</p>
         <span>Apply</span>
       </a>
       <a href="https://www.ycombinator.com/companies/ohm-2/jobs/gJ5Oglm-founding-gtm-intern">
         <p>Founding GTM Intern</p>
         <p>San Francisco, CA · Onsite</p>
         <span>Apply</span>
       </a>`,
      "https://www.ohm.ai/careers",
    );
    expect(listings.map((row) => row.title)).toEqual([
      "Founding Account Executive",
      "Chief of Staff",
      "Full Stack Engineer",
      "Founding GTM Intern",
    ]);
    expect(listings.map((row) => row.location)).toEqual([
      "San Francisco, CA · Hybrid",
      "San Francisco, CA / Remote (London, UK)",
      "San Francisco, CA · Onsite",
      "San Francisco, CA · Onsite",
    ]);
  });
});

describe("Landeed YC board", () => {
  it("reads roles from the WaasShowJobsPage data-page fixture", () => {
    const listings = extractListingsFromCareersHtml(
      LANDEED_YC_FIXTURE,
      "https://www.ycombinator.com/companies/landeed/jobs",
    );
    expect(listings.map((row) => row.title)).toEqual([
      "People & Operations Associate (HR & Admin)",
      "Accountant",
      "Senior/Staff Engineer: Backend (India)",
    ]);
    expect(listings[1]?.location).toBe(
      "Hyderabad, TS, IN / Hyderabad, Telangana, IN",
    );
    expect(listings[1]?.sourceUrl).toBe(
      "https://www.ycombinator.com/companies/landeed/jobs/tipcFfI-accountant",
    );
  });
});

describe("Ginmon open-role repair", () => {
  it("closes the index row and upserts the six live offer URLs", async () => {
    const migration = readFileSync(
      join(process.cwd(), "src/migrations/20260927d_ginmon_open_roles.ts"),
      "utf8",
    );
    expect(migration).toContain("'offene stellen'");
    expect(migration).toContain("\"status\" = 'closed'");
    expect(migration).toContain("ginmon.de/careers/jobs");
    for (const title of GINMON_LIVE_TITLES) {
      expect(migration).toContain(title);
    }
    expect(migration).toContain(
      "https://ginmon.recruitee.com/o/working-student-software-engineering-mfd",
    );
    expect(migration).toContain('"open_role_count"');

    const { migrations } = await import("@/migrations");
    const names = migrations.map((entry) => entry.name);
    const at = names.indexOf("20260927d_ginmon_open_roles");
    expect(at).toBeGreaterThan(
      names.indexOf("20260927c_onboarding_dismissed_at"),
    );
    expect(names.lastIndexOf("20260927d_ginmon_open_roles")).toBe(at);
    expect(typeof migrations[at]?.up).toBe("function");
    expect(typeof migrations[at]?.down).toBe("function");
  });
});
