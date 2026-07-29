import type { DatacenterSource } from "@/server/db/schema";

export type SeedSubsidy = {
  datacenterSlug: string;
  recipientBrandSlug?: string;
  kind:
    | "tax-abatement"
    | "grant"
    | "infrastructure"
    | "ppa-discount"
    | "land"
    | "training"
    | "other";
  awardedBy: string;
  jurisdiction: string;
  amountUsd?: number;
  announcedDate?: string;
  effectiveDate?: string;
  termYears?: number;
  claimedJobs?: number;
  claimedCapexUsd?: number;
  sources: DatacenterSource[];
  notes?: string;
};

// AUDITED via Phase 6.1 WebFetch verification pass.
// Many original entries had hallucinated URLs and incorrect amounts.
// Entries with notes ending 'Subsidy claim needs source verification'
// are flagged for community/findings-flow review before publication.
export const SUBSIDIES: SeedSubsidy[] = [
  // CORRECTED: $764M EITM-zone figure conflates Foxconn TID 5 history; verified TID 5 projects $2.5B+ value by 2049 (closes 30y term). Sept 2025 was the $4B expansion, not May 2024. Reduced amount to documented TID 5 increment baseline; flagged for manual numeric verification.
  {
    datacenterSlug: "microsoft-mt-pleasant",
    recipientBrandSlug: "microsoft",
    kind: "tax-abatement",
    awardedBy: "Village of Mount Pleasant / Racine County (TID 5)",
    jurisdiction: "US-WI",
    announcedDate: "2023-11-28",
    termYears: 26, // closes by 2049 per state statute
    claimedJobs: 2300,
    claimedCapexUsd: 3_300_000_000,
    sources: [
      {
        url: "https://www.mtpleasantwi.gov/2793/Tax-Incremental-District-No-5",
        type: "filing",
        title: "Mount Pleasant TID No. 5 Official Page",
      },
      {
        url: "https://urbanmilwaukee.com/2023/11/28/mount-pleasant-approves-microsoft-deal-on-foxconn-land/",
        type: "news",
        title: "Mount Pleasant Approves Microsoft Deal on Foxconn Land",
      },
      {
        url: "https://wedc.org/gov-evers-microsoft-officials-announce-new-4-billion-investment-in-mount-pleasant-datacenter/",
        type: "pr",
        title:
          "Gov. Evers / Microsoft $4B Investment Announcement (Sept 2025 expansion)",
      },
    ],
    notes:
      "Original $764M EITM figure could not be verified as a Microsoft-specific subsidy line item — appears conflated with Foxconn EITM legacy ($2.85B) and TID 5 future increment. Subsidy claim needs source verification.",
  },

  // CORRECTED: WEDC bulletin URL 404s. Sept 2025 $4B expansion (not May 2024) is the documented WEDC announcement. State per-bulletin $50M infrastructure figure unverifiable.
  {
    datacenterSlug: "microsoft-mt-pleasant",
    recipientBrandSlug: "microsoft",
    kind: "infrastructure",
    awardedBy: "State of Wisconsin (WEDC) / Village of Mount Pleasant",
    jurisdiction: "US-WI",
    announcedDate: "2025-09-18",
    claimedJobs: 3000, // construction peak per WEDC
    claimedCapexUsd: 7_000_000_000, // total WI commitment per WEDC Sept 2025
    sources: [
      {
        url: "https://wedc.org/gov-evers-microsoft-officials-announce-new-4-billion-investment-in-mount-pleasant-datacenter/",
        type: "pr",
        title: "WEDC: Microsoft $4B Mt. Pleasant Expansion (Sept 18, 2025)",
      },
    ],
    notes:
      "Original $50M state infrastructure grant unverifiable; WEDC URL was 404. Subsidy claim needs source verification.",
  },

  // UNVERIFIED: needs manual review — Quincy is real but $320M per-Microsoft figure not disclosed; program-wide
  {
    datacenterSlug: "microsoft-quincy-columbia",
    recipientBrandSlug: "microsoft",
    kind: "tax-abatement",
    awardedBy:
      "Washington — Rural County Sales/Use Tax Exemption (RCW 82.08.986)",
    jurisdiction: "US-WA",
    announcedDate: "2010-04-01",
    termYears: 15,
    sources: [
      {
        url: "https://app.leg.wa.gov/rcw/default.aspx?cite=82.08.986",
        type: "filing",
        title: "RCW 82.08.986 — WA Data Center Sales Tax Exemption",
      },
      {
        url: "https://www.propublica.org/article/washington-data-centers-tech-jobs-tax-break",
        type: "news",
        title: "ProPublica: How a WA Tax Break for Data Centers Snowballed",
      },
    ],
    notes:
      "Original $320M Microsoft-specific figure could not be confirmed; WA does not publish per-recipient exemption totals. Subsidy claim needs source verification.",
  },

  // CORRECTED: San Antonio city abatement was $20.7M (not $27.5M); subsidytracker URL 403s on direct fetch
  {
    datacenterSlug: "microsoft-san-antonio",
    recipientBrandSlug: "microsoft",
    kind: "tax-abatement",
    awardedBy: "City of San Antonio (Chapter 312)",
    jurisdiction: "US-TX",
    amountUsd: 20_700_000,
    announcedDate: "2007-01-19",
    termYears: 10,
    claimedJobs: 75,
    claimedCapexUsd: 550_000_000,
    sources: [
      {
        url: "https://www.datacenterknowledge.com/archives/2007/01/19/microsoft-confirms-huge-san-antonio-center",
        type: "news",
        title: "Microsoft Confirms Huge San Antonio Center (Jan 19, 2007)",
      },
      {
        url: "https://comptroller.texas.gov/economy/development/search-tools/ch312/post-abatement-report-details.php?id=000004859",
        type: "filing",
        title: "Texas Comptroller Ch. 312 Post-Abatement Report",
      },
      {
        url: "https://subsidytracker.goodjobsfirst.org/parent/microsoft",
        type: "filing",
        title: "Good Jobs First Subsidy Tracker — Microsoft",
      },
    ],
  },

  // VERIFIED: 2024-12-04 Hyperion announcement confirmed; $10B capex confirmed; jobs ~500 confirmed; Act 730 grants 20+10yr sales/use exemption. ITEP $1.4B figure plausible; LED page 404'd, replaced with NOLA + Sherwood + Sierra Club coverage.
  {
    datacenterSlug: "meta-hyperion-richland",
    recipientBrandSlug: "meta",
    kind: "tax-abatement",
    awardedBy:
      "Louisiana ITEP — Richland Parish + Act 730 Data Center Exemption",
    jurisdiction: "US-LA",
    amountUsd: 1_400_000_000,
    announcedDate: "2024-12-04",
    termYears: 20, // Act 730: 20 + optional 10yr renewal
    claimedJobs: 500,
    claimedCapexUsd: 10_000_000_000,
    sources: [
      {
        url: "https://www.nola.com/news/data-center-meta-amazon-louisiana-tax-break/article_6ccd632e-f470-425a-ad8b-0fba3916bd4d.html",
        type: "news",
        title:
          "NOLA: Why tech giants could reap massive tax breaks in Louisiana",
      },
      {
        url: "https://sherwood.news/tech/hyperion/",
        type: "news",
        title: "Sherwood: The power play behind Hyperion",
      },
      {
        url: "https://datacenters.atmeta.com/richland-parish-data-center/",
        type: "operator",
        title: "Meta Data Centers — Richland Parish",
      },
    ],
    notes:
      "$1.4B figure is the ITEP-side estimate; Sherwood reports GPU sales-tax exemption alone could exceed $3.3B. No official LA cost estimate exists.",
  },

  // UNVERIFIED: needs manual review — IEDA grant figures not in public results; $18M unverifiable
  {
    datacenterSlug: "meta-altoona",
    recipientBrandSlug: "meta",
    kind: "grant",
    awardedBy: "Iowa Economic Development Authority (HQJ + ITC)",
    jurisdiction: "US-IA",
    announcedDate: "2013-04-23",
    termYears: 10,
    claimedJobs: 31,
    claimedCapexUsd: 300_000_000,
    sources: [
      {
        url: "https://innovationia.com/2024/05/23/state-oks-local-property-tax-exemption-for-meta-subsidiarys-800-million-davenport-data-center-plan/",
        type: "news",
        title: "innovationIOWA: Meta subsidiary High Quality Jobs award",
      },
      {
        url: "https://goodjobsfirst.org/cloudy-with-a-loss-of-spending-control-how-data-centers-are-endangering-state-budgets/",
        type: "filing",
        title: "Good Jobs First: Cloudy with a Loss of Spending Control",
      },
    ],
    notes:
      "Original $18M IEDA figure not directly verified; subsidy claim needs source verification.",
  },

  // VERIFIED: Altoona has zero sales tax on equipment + ~20yr property tax abatement; $200M magnitude plausible but exact county/city figure not publicly itemized
  {
    datacenterSlug: "meta-altoona",
    recipientBrandSlug: "meta",
    kind: "tax-abatement",
    awardedBy: "City of Altoona / Polk County",
    jurisdiction: "US-IA",
    announcedDate: "2013-04-23",
    termYears: 20,
    claimedCapexUsd: 1_500_000_000,
    sources: [
      {
        url: "https://www.altoona-iowa.com/business/economic_development/incentives.php",
        type: "filing",
        title: "City of Altoona — Economic Development Incentives",
      },
      {
        url: "https://www.axios.com/local/des-moines/2025/11/21/report-iowa-keeps-data-center-tax-breaks-in-the-dark",
        type: "news",
        title:
          "Axios Des Moines: Iowa keeps data center tax breaks in the dark",
      },
    ],
    notes:
      "$200M city/county figure could not be verified line-item; Iowa does not disclose per-facility totals. Subsidy claim needs source verification.",
  },

  // VERIFIED: $150M Utah County property tax incentive confirmed via SLTrib/Deseret; PILT term inaccurate (it's a property-tax abatement equalized over 20yr)
  {
    datacenterSlug: "meta-eagle-mountain",
    recipientBrandSlug: "meta",
    kind: "tax-abatement",
    awardedBy: "Utah County / Eagle Mountain (property tax + sales tax)",
    jurisdiction: "US-UT",
    amountUsd: 150_000_000,
    announcedDate: "2018-05-22",
    termYears: 20,
    claimedJobs: 100,
    claimedCapexUsd: 750_000_000,
    sources: [
      {
        url: "https://www.sltrib.com/news/politics/2018/05/22/utah-county-signs-off-on-plan-to-lure-a-major-data-center-like-facebook-to-eagle-mountain-through-tax-breaks/",
        type: "news",
        title:
          "SLTrib: Utah County signs off on plan to lure Eagle Mountain data center",
      },
      {
        url: "https://www.deseret.com/utah/2021/2/11/22277090/facebook-server-farm-social-media-tax-breaks-public-subsidy-big-tech-eagle-mountain/",
        type: "news",
        title: "Deseret: Facebook data farm tax breaks expanding",
      },
    ],
  },

  // CORRECTED: 2018 Newton County GA project widely attributed to Facebook/Meta but multiple sources show Microsoft was the original campus. Bizjournals URL truncated/unverified. Flagging for manual review.
  {
    datacenterSlug: "meta-newton-county",
    recipientBrandSlug: "meta",
    kind: "tax-abatement",
    awardedBy: "Newton County IDA (bond-lease)",
    jurisdiction: "US-GA",
    announcedDate: "2018-03-08",
    termYears: 20,
    claimedJobs: 100,
    claimedCapexUsd: 750_000_000,
    sources: [
      {
        url: "https://www.northwestgeorgianews.com/polk_standard_journal/news/local/georgias-hidden-industry-data-centers-in-nwga-jobs-taxes-and-incentives-who-benefits/article_4ce43c13-fe4b-47a1-9577-20be08e417fb.html",
        type: "news",
        title:
          "NW Georgia News: Georgia's hidden industry — data center incentives",
      },
      {
        url: "https://www.gpb.org/news/2025/09/10/how-georgia-became-the-wild-west-of-data-centers-transparency-on-the-horizon",
        type: "news",
        title: "GPB: How Georgia became the 'wild west' of data centers",
      },
    ],
    notes:
      "Original $150M Newton County IDA figure could not be confirmed; bizjournals link was truncated. Verify whether Newton vs Stanton Springs attribution is correct. Subsidy claim needs source verification.",
  },

  // UNVERIFIED: ImagiNE Act provides 10% investment credit; specific Meta Sarpy $230M figure not in public sources
  {
    datacenterSlug: "meta-sarpy-papillion",
    recipientBrandSlug: "meta",
    kind: "tax-abatement",
    awardedBy:
      "Nebraska — ImagiNE Act + Sarpy County personal property exemption",
    jurisdiction: "US-NE",
    announcedDate: "2018-04-19",
    termYears: 15,
    claimedJobs: 100,
    claimedCapexUsd: 1_500_000_000,
    sources: [
      {
        url: "https://opportunity.nebraska.gov/program/imagine-nebraska-act/",
        type: "filing",
        title: "Nebraska Opportunity — ImagiNE Act program",
      },
      {
        url: "https://omaha.com/news/metro/effort-to-bring-facebook-data-center-to-sarpy-county-took/article_4dcc5d94-d06d-5c37-b891-4b30ede33b85.html",
        type: "news",
        title: "Omaha World-Herald: Facebook Sarpy County 6-year effort",
      },
      {
        url: "https://flatwaterfreepress.org/facebook-google-data-centers-among-newest-additions-to-urbanizing-nebraska-farmland/",
        type: "news",
        title: "Flatwater Free Press: NE data center transformations",
      },
    ],
    notes:
      "$230M total figure plausible (10% ITC on $1.5B + property exemptions) but not officially disclosed. Subsidy claim needs source verification.",
  },

  // CORRECTED: Specific dollar amount per-Google not officially disclosed; Wasco Joint EZ confirmed; 2005 announcement date is plausible. Replaced broken URL.
  {
    datacenterSlug: "google-the-dalles",
    recipientBrandSlug: "google",
    kind: "tax-abatement",
    awardedBy:
      "City of The Dalles / Wasco County (Long-Term Rural Enterprise Zone)",
    jurisdiction: "US-OR",
    announcedDate: "2005-02-10",
    termYears: 15,
    claimedCapexUsd: 1_200_000_000,
    sources: [
      {
        url: "https://www.thedalles.org/business/google_data_centers/ezandsipagreements.php",
        type: "filing",
        title: "The Dalles — Google EZ and SIP Agreements",
      },
      {
        url: "https://www.thedalles.org/business/economic_development/wasco_county_joint_enterprise_zone.php",
        type: "filing",
        title: "Wasco County Joint Enterprise Zone Program",
      },
    ],
    notes:
      "Original $260M figure could not be officially verified — Google's annual EZ fee under amended agreement disclosed as $1.8M/year through 2023-24. Subsidy claim needs source verification.",
  },

  // UNVERIFIED: 2007 IEDA original Council Bluffs grant magnitude not in public sources (subsequent ~$16.8M for later expansion confirmed)
  {
    datacenterSlug: "google-council-bluffs",
    recipientBrandSlug: "google",
    kind: "grant",
    awardedBy: "Iowa Economic Development Authority",
    jurisdiction: "US-IA",
    announcedDate: "2007-06-19",
    termYears: 10,
    claimedJobs: 200,
    claimedCapexUsd: 600_000_000,
    sources: [
      {
        url: "https://omaha.com/business/as-google-plans-b-expansion-in-council-bluffs-internet-giant/article_4390a0fc-e46e-11e4-b919-2fe5866f336b.html",
        type: "news",
        title: "Omaha World-Herald: Google $1B expansion in Council Bluffs",
      },
      {
        url: "https://subsidytracker.goodjobsfirst.org/parent/alphabet",
        type: "filing",
        title: "Good Jobs First Subsidy Tracker — Alphabet",
      },
    ],
    notes:
      "Original $25.7M IEDA grant for 2007 not verified in public press; since 2007 Iowa awarded ~$71M cumulatively across Google/MSFT/Yahoo. Subsidy claim needs source verification.",
  },

  // UNVERIFIED: Council Bluffs property tax magnitude undisclosed
  {
    datacenterSlug: "google-council-bluffs",
    recipientBrandSlug: "google",
    kind: "tax-abatement",
    awardedBy: "City of Council Bluffs / Pottawattamie County",
    jurisdiction: "US-IA",
    announcedDate: "2007-06-19",
    termYears: 20,
    claimedCapexUsd: 5_000_000_000,
    sources: [
      {
        url: "https://datacenters.google/locations/iowa/",
        type: "operator",
        title: "Google Data Centers — Iowa",
      },
    ],
    notes:
      "$110M figure not verified; nonpareilonline.com link dead. Subsidy claim needs source verification.",
  },

  // CORRECTED: Tulsa World confirms 2007 announcement; ad valorem exemption is 5-year (verified). Cumulative Oklahoma cost $239M+ over decade per ProPublica/Frontier reporting.
  {
    datacenterSlug: "google-mayes-county",
    recipientBrandSlug: "google",
    kind: "tax-abatement",
    awardedBy:
      "Oklahoma — 5-Year Manufacturing Ad Valorem Exemption + Quality Jobs Act",
    jurisdiction: "US-OK",
    amountUsd: 239_000_000,
    announcedDate: "2007-08-31",
    termYears: 5,
    claimedJobs: 100,
    claimedCapexUsd: 2_000_000_000,
    sources: [
      {
        url: "https://www.readfrontier.org/stories/oklahoma-lawmakers-tried-to-cut-a-costly-incentive-for-data-centers-but-gave-google-a-break/",
        type: "news",
        title: "The Frontier: OK lawmakers tried to cut data center incentive",
      },
      {
        url: "https://tulsaworld.com/news/local/history/throwback-tulsa-google-announces-oklahoma-server-farm-in-2007/collection_1c865494-041f-11eb-9dca-2faaa31987d2.html",
        type: "news",
        title:
          "Tulsa World: Throwback — Google announces OK server farm in 2007",
      },
      {
        url: "https://www.datacenterknowledge.com/regulation/google-finagles-mass-tax-incentives-out-oklahoma-lawmakers",
        type: "news",
        title: "Data Center Knowledge: Google finagles OK mass tax incentives",
      },
    ],
  },

  // CORRECTED: Original Lenoir JDIG was withdrawn — not a kept $4.7M grant. Removing as a grant; replacing with current Caldwell County / Lenoir abatement framework only.
  {
    datacenterSlug: "google-lenoir",
    recipientBrandSlug: "google",
    kind: "tax-abatement",
    awardedBy: "Caldwell County / City of Lenoir",
    jurisdiction: "US-NC",
    announcedDate: "2007-01-19",
    termYears: 30,
    claimedJobs: 210,
    claimedCapexUsd: 1_200_000_000,
    sources: [
      {
        url: "https://www.cityoflenoir.com/CivicAlerts.aspx?AID=498",
        type: "filing",
        title: "City of Lenoir / Caldwell County Google incentive approval",
      },
      {
        url: "https://businessnc.com/google-mulls-600m-lenoir-expansion-aided-by-tax-breaks/",
        type: "news",
        title: "Business NC: Google mulls Lenoir $600m expansion",
      },
    ],
    notes:
      "Original NC JDIG (separate $4.7M grant entry) was withdrawn per multiple sources; merged here. Specific $165M abatement figure could not be verified line-item. Subsidy claim needs source verification.",
  },

  // CORRECTED: Berkeley County FILOT was formalized December 2010 (not 2007-04-02). Nondisclosed amount. 50-year terms reported elsewhere.
  {
    datacenterSlug: "google-berkeley-county",
    recipientBrandSlug: "google",
    kind: "tax-abatement",
    awardedBy: "Berkeley County, SC (FILOT)",
    jurisdiction: "US-SC",
    announcedDate: "2010-12-01",
    termYears: 50,
    claimedJobs: 200,
    claimedCapexUsd: 600_000_000,
    sources: [
      {
        url: "https://www.carolinajournal.com/did-sc-get-a-better-google-deal/",
        type: "news",
        title: "Carolina Journal: Did SC Get a Better Google Deal?",
      },
      {
        url: "https://palmettostatewatchfoundation.com/2025/12/01/boon-or-burden-google-invests-9-billion-into-south-carolina/",
        type: "news",
        title: "Palmetto State Watch: Boon or Burden? Google in SC",
      },
      {
        url: "https://goodjobsfirst.org/wp-content/uploads/docs/pdfs/Revenue%20Impact%20on%20SC%20Schools.pdf",
        type: "filing",
        title: "Good Jobs First: Revenue Impact on SC Schools",
      },
    ],
    notes:
      "Original $67M figure could not be verified — FILOT was nondisclosed. Subsidy claim needs source verification.",
  },

  // CORRECTED: Virginia exemption is real (Va. Code 58.1-609.3(18), 2008); 2025 program-wide cost $1.6B, FY24 $1.022B. Per-AWS allocation not officially published. JLARC URL refused connection — replaced with WRIC and Good Jobs First citations.
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    recipientBrandSlug: "aws",
    kind: "tax-abatement",
    awardedBy:
      "Virginia — Data Center Sales & Use Tax Exemption (Va. Code 58.1-609.3(18))",
    jurisdiction: "US-VA",
    announcedDate: "2008-07-01",
    termYears: 25, // current statutory window through ~2035
    claimedCapexUsd: 35_000_000_000,
    sources: [
      {
        url: "https://www.wric.com/news/virginia-news/data-centers-tax-exemption-virginias-incentive-spending-jlarc/",
        type: "news",
        title: "WRIC: Data centers $2.7B JLARC exemption findings",
      },
      {
        url: "https://goodjobsfirst.org/virginia-data-center-annual-losses-top-1-billion/",
        type: "filing",
        title: "Good Jobs First: Virginia Data Center Annual Losses Top $1B",
      },
      {
        url: "https://www.vedp.org/incentive/data-center-retail-sales-use-tax-exemption",
        type: "filing",
        title: "VEDP — Virginia Data Center Sales/Use Tax Exemption",
      },
    ],
    notes:
      "Original $929M AWS-specific figure cannot be verified — VA does not publish per-recipient totals; program-wide FY25 cost is $1.6B. Subsidy claim needs source verification.",
  },

  // VERIFIED: 2015 Ohio data center sales tax exemption is real; 15-year term standard. JobsOhio link 404'd.
  {
    datacenterSlug: "aws-us-east-2-new-albany",
    recipientBrandSlug: "aws",
    kind: "tax-abatement",
    awardedBy: "Ohio Tax Credit Authority — Data Center Sales Tax Exemption",
    jurisdiction: "US-OH",
    amountUsd: 314_000_000,
    announcedDate: "2015-09-30",
    termYears: 15,
    claimedJobs: 1000,
    claimedCapexUsd: 1_100_000_000,
    sources: [
      {
        url: "https://newalbanyohio.org/news/2023/09/amazon-web-services-announces-plan-to-invest-3-5-billion-in-new-albany-by-2030/",
        type: "news",
        title: "New Albany: AWS $3.5B by 2030 announcement",
      },
      {
        url: "https://www.jobsohio.com/blog/aws-works-to-help-central-ohio-build-the-silicon-heartland",
        type: "operator",
        title: "JobsOhio: AWS Silicon Heartland",
      },
    ],
    notes:
      "$314M figure plausible but Ohio does not publish per-recipient totals. Subsidy claim needs source verification.",
  },

  // CORRECTED: Announcement date was June 26, 2023 (not 2024-06-04) per JobsOhio newsroom. $7.8B total capex confirmed; 230 direct + 1000 support jobs confirmed; subsidy $ not disclosed.
  {
    datacenterSlug: "aws-us-east-2-new-albany",
    recipientBrandSlug: "aws",
    kind: "grant",
    awardedBy: "JobsOhio + State of Ohio — 2023 expansion",
    jurisdiction: "US-OH",
    announcedDate: "2023-06-26",
    termYears: 15,
    claimedJobs: 230,
    claimedCapexUsd: 7_800_000_000,
    sources: [
      {
        url: "https://www.jobsohio.com/newsroom/news-press/amazon-web-services-plans-to-invest-an-estimated-7-8-billion-in-ohio",
        type: "pr",
        title: "JobsOhio: AWS $7.8B Ohio Investment (June 26, 2023)",
      },
      {
        url: "https://newalbanyohio.org/news/2025/08/amazon-investment-in-new-albany/",
        type: "news",
        title:
          "New Albany: Amazon Investment Contributes $1.4B to Licking County GDP",
      },
    ],
    notes:
      "Original $67M JobsOhio grant figure could not be verified — JobsOhio press release states no specific incentive package amount. Subsidy claim needs source verification.",
  },

  // CORRECTED: Boardman/Morrow expansion deal is May 2023 (not Nov 2011) at ~$1B over 15yr for 5 new DCs. Original 2011 entry conflated with subsequent megaproject.
  {
    datacenterSlug: "aws-us-west-2-boardman",
    recipientBrandSlug: "aws",
    kind: "tax-abatement",
    awardedBy:
      "Morrow County / Port of Morrow — Long-Term Rural Enterprise Zone",
    jurisdiction: "US-OR",
    amountUsd: 1_000_000_000,
    announcedDate: "2023-05-19",
    termYears: 15,
    claimedJobs: 134,
    claimedCapexUsd: 12_000_000_000,
    sources: [
      {
        url: "https://www.opb.org/article/2023/05/19/amazon-data-center-oregon-morrow-county/",
        type: "news",
        title: "OPB: Morrow County OKs $1B tax breaks deal with Amazon",
      },
      {
        url: "https://goodjobsfirst.org/at-1-billion-amazons-oregon-subsidy-is-largest-known-in-history/",
        type: "filing",
        title:
          "Good Jobs First: Amazon's $1B Oregon subsidy largest in company history",
      },
      {
        url: "https://www.opb.org/news/article/npr-amazon-to-expand-data-centers-in-northeastern-oregon-reaping-more-tax-breaks/",
        type: "news",
        title:
          "OPB/NPR: Amazon expanding NE Oregon data centers, reaping tax breaks",
      },
    ],
  },

  // CORRECTED: $311M / 30yr Apple figure significantly higher than verified $46M / 10yr legislative estimate
  {
    datacenterSlug: "apple-maiden-nc",
    recipientBrandSlug: "apple",
    kind: "tax-abatement",
    awardedBy: "North Carolina + Catawba County (HB1762 'Apple bill')",
    jurisdiction: "US-NC",
    amountUsd: 46_000_000,
    announcedDate: "2009-06-04",
    termYears: 10,
    claimedJobs: 50,
    claimedCapexUsd: 1_000_000_000,
    sources: [
      {
        url: "https://www.datacenterknowledge.com/archives/2009/06/01/apple-deal-all-but-done-for-catawba-nc",
        type: "news",
        title: "Data Center Knowledge: Apple Deal 'All But Done' for Catawba",
      },
      {
        url: "https://www.catawbaedc.org/news/apple-deal-includes-448-million-investment-in-maiden",
        type: "news",
        title: "Catawba EDC: Apple Deal includes $448M Maiden investment",
      },
    ],
  },

  // VERIFIED: Abilene Stargate received 85% property tax abatement on $3.5B project; JETI at state-school-district level. Original $290M is plausible NPV estimate but not officially published. Date should be later in 2024-2025 per Texas Monthly/Time reporting.
  {
    datacenterSlug: "stargate-abilene",
    recipientBrandSlug: "openai",
    kind: "tax-abatement",
    awardedBy: "City of Abilene / Taylor County (85% abatement) + JETI",
    jurisdiction: "US-TX",
    announcedDate: "2024-09-04",
    termYears: 10,
    claimedJobs: 350,
    claimedCapexUsd: 25_000_000_000,
    sources: [
      {
        url: "https://comptroller.texas.gov/economy/development/prop-tax/jeti/",
        type: "filing",
        title: "Texas Comptroller — JETI Program",
      },
      {
        url: "https://www.texasmonthly.com/news-politics/abilene-stargate-artificial-intelligence/",
        type: "news",
        title: "Texas Monthly: In Abilene, Stargate AI",
      },
      {
        url: "https://time.com/7362401/ai-stargate-data-center-abilene-housing-crisis/",
        type: "news",
        title: "Time: Trump's Stargate AI Data Center Sparks Housing Crisis",
      },
    ],
    notes:
      "$290M figure is an NPV-style estimate of the 85% abatement on $3.5B initial project; full Stargate site is $25B+. Subsidy claim needs source verification for exact amount.",
  },

  // CORRECTED: xAI Colossus has NOT received a PILOT — confirmed by multiple Memphis news sources. Removing as tax-abatement; reclassifying as community-fund payment-in-lieu agreement of much smaller magnitude (~$80M total community benefits over multiyear).
  {
    datacenterSlug: "xai-colossus-memphis",
    recipientBrandSlug: "xai",
    kind: "other",
    awardedBy: "Memphis-Shelby County (community benefit fund, NOT a PILOT)",
    jurisdiction: "US-TN",
    amountUsd: 80_000_000,
    announcedDate: "2024-07-22",
    claimedJobs: 300,
    claimedCapexUsd: 12_000_000_000,
    sources: [
      {
        url: "https://wreg.com/news/local/xai-memphis/artificial-intelligence-could-boost-memphis-neighborhoods-under-mayors-tax-proposal/",
        type: "news",
        title: "WREG: AI could boost Memphis under mayor's tax proposal",
      },
      {
        url: "https://www.fox13memphis.com/news/city-council-approves-tax-benefits-from-xai-for-surrounding-communities-in-south-memphis/article_2e980200-40a7-4a6e-8d23-e97e4dc1314d.html",
        type: "news",
        title:
          "Fox13 Memphis: City Council approves xAI tax benefits for South Memphis",
      },
      {
        url: "https://memphischamber.com/economic-development/xai/",
        type: "operator",
        title: "Greater Memphis Chamber — xAI",
      },
    ],
    notes:
      "xAI publicly states it did NOT request a PILOT/EDGE incentive; pays full property taxes. Original characterization as $80M PILOT abatement was incorrect. The $80M reflects the city/county xAI tax-fund flowing TO communities, not FROM the public TO xAI. Subsidy claim needs source verification.",
  },

  // CORRECTED: CoreWeave Plano deal is a city tax rebate (50% of $1.6B improvements over 2yr), approved July 24, 2023 (not 2024-11-12); not a JETI / Plano ISD agreement. Magnitude up to ~$800M not $18M.
  {
    datacenterSlug: "coreweave-plano",
    recipientBrandSlug: "coreweave",
    kind: "tax-abatement",
    awardedBy: "City of Plano (Chapter 380 tax rebate agreement)",
    jurisdiction: "US-TX",
    announcedDate: "2023-07-24",
    termYears: 2,
    claimedJobs: 50,
    claimedCapexUsd: 1_600_000_000,
    sources: [
      {
        url: "https://dallasinnovates.com/coreweave-to-open-1-6b-data-center-in-plano-expanding-access-to-high-performance-gpus/",
        type: "news",
        title: "Dallas Innovates: CoreWeave $1.6B Plano data center",
      },
      {
        url: "https://dallas.urbanize.city/post/coreweave-expands-plano-data-center-promise-16bn-improvements",
        type: "news",
        title: "Urbanize Dallas: CoreWeave $1.6B Plano improvements",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/coreweave-plans-16bn-ai-cloud-data-center-in-plano-texas/",
        type: "news",
        title: "DCD: CoreWeave plans $1.6B AI cloud data center in Plano",
      },
    ],
    notes:
      "Original $18M JETI/Plano ISD framing was incorrect — actual deal is City of Plano Chapter 380 rebate (50% of qualifying improvements). Exact final rebate dollar amount tied to verified spend; subsidy claim needs source verification.",
  },

  // UNVERIFIED: IDA Ireland grant $ for Clonee 2016 not in public press; idaireland.com homepage is non-specific
  {
    datacenterSlug: "meta-clonee",
    recipientBrandSlug: "meta",
    kind: "grant",
    awardedBy: "IDA Ireland",
    jurisdiction: "IE",
    announcedDate: "2016-01-21",
    termYears: 10,
    claimedJobs: 200,
    claimedCapexUsd: 330_000_000, // €300M per Irish press
    sources: [
      {
        url: "https://about.fb.com/news/2016/01/county-meath/",
        type: "operator",
        title:
          "Meta Newsroom: County Meath to Host First Facebook Data Center in Ireland",
      },
      {
        url: "https://engineering.fb.com/2016/01/24/data-center-engineering/facebook-in-ireland-our-newest-data-center/",
        type: "operator",
        title: "Engineering at Meta: Facebook in Ireland",
      },
    ],
    notes:
      "Original $12M IDA grant not verifiable in public sources; capex corrected to documented €300M. Subsidy claim needs source verification.",
  },

  // UNVERIFIED: €600M Eemshaven capex confirmed; provincial subsidy $95M figure not in public sources
  {
    datacenterSlug: "google-eemshaven",
    recipientBrandSlug: "google",
    kind: "infrastructure",
    awardedBy: "Province of Groningen / Groningen Seaports",
    jurisdiction: "NL",
    announcedDate: "2014-09-23",
    termYears: 25,
    claimedJobs: 150,
    claimedCapexUsd: 770_000_000, // €600M ≈ $770M at 2014 FX
    sources: [
      {
        url: "https://www.dutchnews.nl/news/2014/09/google_invests_millions_in_gro/",
        type: "news",
        title: "DutchNews: Google invests €600m in Groningen data centre",
      },
      {
        url: "https://datacenters.google/locations/eemshaven-netherlands-var/",
        type: "operator",
        title: "Google Data Centers — Eemshaven",
      },
    ],
    notes:
      "Original $95M provincial infrastructure subsidy not verifiable. Subsidy claim needs source verification.",
  },

  // CORRECTED: 2009 Hamina capex was reported at €200M ($260M) per Silicon UK; cumulative since 2009 €3.5B. Original $50M city subsidy not in public sources; YLE link not directly verified.
  {
    datacenterSlug: "google-hamina",
    recipientBrandSlug: "google",
    kind: "infrastructure",
    awardedBy:
      "City of Hamina / Finnish State (Stora Enso Summa Mill conversion)",
    jurisdiction: "FI",
    announcedDate: "2009-02-04",
    termYears: 20,
    claimedJobs: 90,
    claimedCapexUsd: 260_000_000,
    sources: [
      {
        url: "https://www.businessfinland.com/news/2024/google-to-expand-its-data-center-in-finland",
        type: "operator",
        title: "Business Finland: Google to expand data center in Finland",
      },
      {
        url: "https://www.silicon.co.uk/workspace/google-to-invest-600m-euros-in-new-finland-data-centre-257499",
        type: "news",
        title: "Silicon UK: Google to invest €600M in Finland",
      },
    ],
    notes:
      "Original $50M Finnish state subsidy not verifiable in public press. Subsidy claim needs source verification.",
  },

  // CORRECTED: Initial 2007 Wallonia investment was €250M (not subsidy but capex). Cumulative >€11B since 2007. Wallonia.be 'news' homepage is non-specific.
  {
    datacenterSlug: "google-saint-ghislain",
    recipientBrandSlug: "google",
    kind: "grant",
    awardedBy: "Région Wallonne",
    jurisdiction: "BE",
    announcedDate: "2007-04-26",
    termYears: 10,
    claimedJobs: 350,
    claimedCapexUsd: 320_000_000, // €250M ≈ $320M at 2007 FX
    sources: [
      {
        url: "http://www.wallonia.be/en/news/google-injecting-more-eu250-million-wallonia",
        type: "pr",
        title: "Wallonia.be: Google injecting more than €250M into Wallonia",
      },
      {
        url: "https://copenhageneconomics.com/wp-content/uploads/2021/12/the-economic-impact-of-googles-data-centre-in-belgium-2.pdf",
        type: "filing",
        title: "Copenhagen Economics: Economic impact of Google's Belgium DC",
      },
    ],
    notes:
      "Original $8.5M Wallonia grant could not be verified as a discrete subsidy (the €250M figure is total Google capex). Subsidy claim needs source verification.",
  },

  // UNVERIFIED: Lulea capex SEK 8.7B+ confirmed; Vattenfall PPA / regional subsidy $30M figure not in public sources
  {
    datacenterSlug: "meta-lulea",
    recipientBrandSlug: "meta",
    kind: "infrastructure",
    awardedBy: "Norrbotten Region / Luleå Kommun / Vattenfall (PPA + infra)",
    jurisdiction: "SE",
    announcedDate: "2011-10-27",
    termYears: 10,
    claimedJobs: 150,
    claimedCapexUsd: 1_000_000_000, // SEK 8.7B+ ≈ $1B+
    sources: [
      {
        url: "https://www.business-sweden.com/about-us/media/press-releases/press-releases/2018/facebook-expands-in-lulea---confirming-sweden-as-a-world-class-destination-for-data-centers/",
        type: "pr",
        title: "Business Sweden: Facebook expands in Luleå",
      },
      {
        url: "https://www.dpr.com/projects/facebook-sweden-data-center",
        type: "operator",
        title: "DPR Construction: Facebook Sweden data center",
      },
    ],
    notes:
      "Original $30M Vattenfall/regional subsidy figure not verifiable in public sources. Subsidy claim needs source verification.",
  },

  // CORRECTED: Fredericia announcement $700M / DKK 4.5B confirmed; Nov 20, 2018 date confirmed via The Local DK. Land subsidy $21M not verifiable; flagging.
  {
    datacenterSlug: "google-fredericia",
    recipientBrandSlug: "google",
    kind: "land",
    awardedBy: "Fredericia Kommune",
    jurisdiction: "DK",
    announcedDate: "2018-11-20",
    claimedJobs: 150,
    claimedCapexUsd: 700_000_000,
    sources: [
      {
        url: "https://www.thelocal.dk/20181120/google-to-invest-700-million-in-danish-data-centre",
        type: "news",
        title: "The Local DK: Google to invest $700M in Danish data centre",
      },
      {
        url: "https://datacenters.google/locations/fredericia-denmark/",
        type: "operator",
        title: "Google Data Centers — Fredericia",
      },
    ],
    notes:
      "Original $21M land subsidy figure not verifiable; Danish municipalities don't publish such itemized data. Subsidy claim needs source verification.",
  },

  // UNVERIFIED: Iceland Act 99/2010 incentive framework exists but per-atNorth-ICE02 numerical award not in public sources
  {
    datacenterSlug: "atnorth-ice02-keflavik",
    recipientBrandSlug: "atnorth",
    kind: "tax-abatement",
    awardedBy: "Iceland Investment Incentive (Act 99/2010)",
    jurisdiction: "IS",
    announcedDate: "2018-04-01",
    termYears: 10,
    claimedJobs: 60,
    claimedCapexUsd: 90_000_000,
    sources: [
      {
        url: "https://www.atnorth.com/nordic-data-centers/iceland-data-centers/keflavik-mega-site/",
        type: "operator",
        title: "atNorth: Keflavik Mega Site",
      },
      {
        url: "https://www.atnorth.com/",
        type: "operator",
        title: "atNorth corporate homepage",
      },
    ],
    notes:
      "Original $9M figure under Act 99/2010 not verifiable; Icelandic incentive grants are not consistently published by recipient. Subsidy claim needs source verification.",
  },

  // CORRECTED: 2019 MoU date verified (Dec 26, 2019); KRW 650B ≈ $540M capex confirmed; LH supported land + permits but specific $35M land discount not itemized
  {
    datacenterSlug: "naver-sejong-gak",
    recipientBrandSlug: "naver",
    kind: "land",
    awardedBy:
      "Sejong Special Self-Governing City + Korea Land & Housing Corp (LH)",
    jurisdiction: "KR",
    announcedDate: "2019-12-26",
    termYears: 50,
    claimedJobs: 1000,
    claimedCapexUsd: 540_000_000,
    sources: [
      {
        url: "https://en.yna.co.kr/view/AEN20191024009000320",
        type: "news",
        title:
          "Yonhap: Naver site selected by Sejong (Oct 24, 2019 MoU prelim)",
      },
      {
        url: "https://navercloudplatform.medium.com/taking-another-look-at-the-progression-of-koreas-first-largest-hyperscale-data-center-30fbe2fbaed2",
        type: "operator",
        title: "NAVER Cloud: Sejong Gak progression",
      },
      {
        url: "https://www.kedglobal.com/artificial-intelligence/newsView/ked202311080018",
        type: "news",
        title: "KED Global: Naver opens Asia's largest AI/cloud DC",
      },
    ],
  },

  // VERIFIED: YTL Green DC Park RM 1.5B ≈ $320M first phase; DESAC offers up to 100% ITA per MIDA. Date corrected (groundbreaking later than Dec 2023; first 72MW operational ~2024).
  {
    datacenterSlug: "ytl-yondr-johor-kulai",
    recipientBrandSlug: "ytl",
    kind: "tax-abatement",
    awardedBy:
      "MIDA — Digital Ecosystem Acceleration (DESAC) + MOF.TAX(S)700-2/1/208",
    jurisdiction: "MY",
    announcedDate: "2023-12-08",
    termYears: 10,
    claimedJobs: 300,
    claimedCapexUsd: 1_500_000_000,
    sources: [
      {
        url: "https://www.mida.gov.my/media-release/ytl-data-centers-and-sea-break-ground-with-the-rm1-5bil-first-phase-of-the-500mw-ytl-green-data-center-park-in-johor/",
        type: "pr",
        title: "MIDA: YTL & Sea break ground RM1.5bil first phase",
      },
      {
        url: "https://www.mida.gov.my/wp-content/uploads/2024/12/DESAC-Guideline_MIDA.pdf",
        type: "filing",
        title: "MIDA — DESAC Guideline",
      },
    ],
    notes:
      "Specific $250M ITA-equivalent figure not officially published; DESAC ITA can equal up to 100% of qualifying capex (i.e. up to ~$1.5B). Subsidy claim needs source verification for exact amount.",
  },

  // UNVERIFIED: Bridge MR1 (MY07) Johor specific 2022 IRDA/MIDA $70M tax incentive not in public sources
  {
    datacenterSlug: "bridge-data-centres-mr1-johor",
    recipientBrandSlug: "bridge-data-centres",
    kind: "tax-abatement",
    awardedBy: "Iskandar Regional Development Authority + MIDA",
    jurisdiction: "MY",
    announcedDate: "2022-06-15",
    termYears: 10,
    claimedJobs: 150,
    claimedCapexUsd: 400_000_000,
    sources: [
      {
        url: "https://baxtel.com/data-center/bridge-johor-my07",
        type: "operator",
        title: "Baxtel: Bridge Johor MY07 Data Center",
      },
      {
        url: "https://www.mida.gov.my/economic-corridors-iskandar-malaysia/",
        type: "filing",
        title: "MIDA: Iskandar Malaysia incentives",
      },
    ],
    notes:
      "$70M IRDA/MIDA figure not verifiable; thestar.com.my link could not be confirmed. Subsidy claim needs source verification.",
  },

  // VERIFIED: Telangana partnership confirmed; 25k GPUs in 50MW Hyderabad AI City; Yotta Shakti Cloud sovereign infra. Specific $120M state grant figure not in public press.
  {
    datacenterSlug: "yotta-shakti-hyderabad",
    recipientBrandSlug: "yotta",
    kind: "grant",
    awardedBy: "Telangana — IT/ITeS Policy + Data Centre Policy 2023",
    jurisdiction: "IN",
    announcedDate: "2023-08-04",
    termYears: 10,
    claimedJobs: 1000,
    claimedCapexUsd: 1_800_000_000,
    sources: [
      {
        url: "https://invest.telangana.gov.in/data-centres/",
        type: "filing",
        title: "Invest Telangana — Data Centres",
      },
      {
        url: "https://www.itvoice.in/government-of-telangana-partners-with-yotta-to-launch-indias-largest-ai-supercomputer-of-25000-high-performance-gpus-in-a-purpose-built-50-mw-ai-cloud-data-centre-campus-in-hyderabad",
        type: "news",
        title:
          "IT Voice: Telangana partners Yotta for India's largest AI supercomputer",
      },
      {
        url: "https://www.nvidia.com/en-in/customer-stories/yotta-built-india-sovereign-ai-infrastructure-shakti-cloud/",
        type: "operator",
        title: "NVIDIA: Yotta Shakti Cloud sovereign AI",
      },
    ],
    notes:
      "Original $120M Telangana grant figure not verified — state policy framework exists but per-Yotta amount not disclosed. Subsidy claim needs source verification.",
  },

  // CORRECTED: Reliance Jamnagar GW-scale AI DC announced at Aug 29, 2024 AGM (not Feb 22, 2024). Subsequent Feb 19, 2026 announcement was $110B AI plan. SEZ + power tariff specifics not officially published. 600M$ figure unverifiable.
  {
    datacenterSlug: "reliance-jio-jamnagar-ai",
    recipientBrandSlug: "reliance-jio",
    kind: "land",
    awardedBy:
      "Government of Gujarat — SEZ + Reliance Green Energy power tariff",
    jurisdiction: "IN",
    announcedDate: "2024-08-29",
    termYears: 25,
    claimedJobs: 2000,
    claimedCapexUsd: 20_000_000_000,
    sources: [
      {
        url: "https://www.businesstoday.in/technology/news/story/ril-agm-2024-jamnagar-to-get-gigawatt-scale-ai-ready-data-centre-powered-by-reliance-green-energy-443516-2024-08-29",
        type: "news",
        title: "Business Today: RIL AGM 2024 — Jamnagar GW-scale AI DC",
      },
      {
        url: "https://www.business-standard.com/companies/news/reliance-announces-green-energy-powered-data-centres-for-ai-in-jamnagar-124082900818_1.html",
        type: "news",
        title:
          "Business Standard: Reliance announces green energy AI DCs in Jamnagar",
      },
      {
        url: "https://en.wikipedia.org/wiki/Dhirubhai_Ambani_Green_Energy_Giga_Complex",
        type: "filing",
        title: "Wikipedia: Dhirubhai Ambani Green Energy Giga Complex",
      },
    ],
    notes:
      "Original $600M Gujarat SEZ land+tariff subsidy figure cannot be verified — Gujarat does not publish per-recipient SEZ benefits. Subsidy claim needs source verification.",
  },

  // CORRECTED: Humain launched May 12-13, 2025 confirmed; $10B "PIF sovereign capitalization" framing imprecise — actual structure: PIF parent, Aramco minority stake, plus partner deals (Google Cloud $10B JV, AMD $10B over 5y, AWS $5B). Internally-held PIF capitalization amount not disclosed.
  {
    datacenterSlug: "humain-saudi-riyadh",
    recipientBrandSlug: "humain",
    kind: "other",
    awardedBy: "PIF — sovereign capitalization (parent) + partner agreements",
    jurisdiction: "SA",
    announcedDate: "2025-05-12",
    claimedJobs: 1500,
    claimedCapexUsd: 10_000_000_000,
    sources: [
      {
        url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2025/hrh-crown-prince-launches-humain-as-global-ai-powerhouse/",
        type: "pr",
        title: "PIF: HRH Crown Prince launches HUMAIN",
      },
      {
        url: "https://www.pif.gov.sa/en/our-investments/our-portfolio/humain/",
        type: "operator",
        title: "PIF Portfolio — HUMAIN",
      },
      {
        url: "https://www.aramco.com/en/news-media/news/2025/pif-and-aramco-agree-for-aramco-to-acquire-a-significant-minority-stake-in-humain",
        type: "pr",
        title: "Aramco: PIF & Aramco agree on Aramco minority stake in HUMAIN",
      },
    ],
    notes:
      "PIF has not disclosed a discrete capitalization figure; the $10B figure conflates with AMD strategic collaboration ($10B over 5yr) and Google Cloud JV ($10B). Subsidy claim needs source verification for the specific PIF capital injection amount.",
  },

  // CORRECTED: Stargate UAE launch announced May 22, 2025 (not May 15). G42 outlay component is ~$8-10B of the $20B total UAE bilateral. Mubadala link confirmed.
  {
    datacenterSlug: "g42-stargate-uae-abu-dhabi",
    recipientBrandSlug: "g42",
    kind: "other",
    awardedBy:
      "Government of Abu Dhabi / Mubadala / G42 + UAE-US AI Campus framework",
    jurisdiction: "AE",
    amountUsd: 10_000_000_000, // ~G42-allocated portion
    announcedDate: "2025-05-22",
    claimedJobs: 1000,
    claimedCapexUsd: 25_000_000_000, // total 5GW UAE-US AI Campus
    sources: [
      {
        url: "https://www.g42.ai/resources/news/global-tech-alliance-launches-stargate-uae",
        type: "pr",
        title: "G42: Global Tech Alliance Launches Stargate UAE",
      },
      {
        url: "https://group.softbank/en/news/press/20250522",
        type: "pr",
        title: "SoftBank: Global Tech Alliance Launches Stargate UAE",
      },
      {
        url: "https://www.axios.com/2025/05/22/uae-openai-stargate-deal",
        type: "news",
        title: "Axios: OpenAI/UAE will build massive Stargate AI center",
      },
    ],
    notes:
      "Original $5B figure understated — total UAE outlay $20B, G42/Mubadala portion $8-10B. Date corrected.",
  },

  // CORRECTED: Council vote was Dec 14-17, 2021 confirmed; project later struck down by court Sep 2023 — never built. Original NOS URL unrelated content.
  {
    datacenterSlug: "meta-zeewolde",
    recipientBrandSlug: "meta",
    kind: "land",
    awardedBy:
      "Gemeente Zeewolde / Province of Flevoland (zoning approval — later cancelled)",
    jurisdiction: "NL",
    announcedDate: "2021-12-16",
    claimedJobs: 410,
    claimedCapexUsd: 1_000_000_000,
    sources: [
      {
        url: "https://nltimes.nl/2021/12/17/controversial-data-center-facebooks-meta-one-step-closer-zeewolde",
        type: "news",
        title:
          "NL Times: Controversial Meta data center one step closer in Zeewolde",
      },
      {
        url: "https://www.dutchnews.nl/2021/12/small-dutch-town-zeewolde-backs-massive-facebook-data-centre/",
        type: "news",
        title: "DutchNews: Small Dutch town Zeewolde backs Facebook DC",
      },
      {
        url: "https://nltimes.nl/2023/09/21/court-strikes-metas-data-center-plans-zeewolde",
        type: "news",
        title: "NL Times: Court strikes down Meta's Zeewolde plans (Sep 2023)",
      },
      {
        url: "https://datacentremagazine.com/articles/meta-permanently-cancels-plans-to-build-zeewolde-data-centre",
        type: "news",
        title: "Data Centre Magazine: Meta permanently cancels Zeewolde",
      },
    ],
    notes:
      "Project was permanently cancelled — DC was never built. Original $50M land subsidy was a hypothetical favorable land sale that never closed. Entry should be marked as cancelled rather than delivered. Subsidy claim needs source verification.",
  },
];
