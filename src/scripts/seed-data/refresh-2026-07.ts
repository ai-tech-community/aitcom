/**
 * AI datacenter investigation refresh — research window 2026-04-28 to 2026-07-29.
 *
 * Machine-gathered by parallel research agents, then validated: every record
 * carries at least one source, every cited URL is reproduced in the source
 * appendix at docs/research/2026-07-29-datacenter-refresh-sources.json, and
 * every slug was checked against the existing dataset for exact and fuzzy
 * duplicates before landing here.
 *
 * Written as a separate module rather than appended to na/eu/apac/ai-native so
 * this batch stays reviewable and revertable on its own. seed-datacenters.ts
 * and seed-investigations.ts merge it through their existing dedupe helpers.
 *
 * Records by type:
 *   datacenters          114
 *   brands               89
 *   permits              18
 *   subsidies            5
 *   capex                10
 *   commitments          2
 *   ownershipEdges       17
 *   suppliers            4
 *
 * Caveats that survive into the data:
 *   - Many coordinates are town or county centroids, not surveyed parcels;
 *     operators rarely disclose a plot. Each such record says so in its
 *     description.
 *   - Capacity is omitted rather than estimated wherever the operator gave no
 *     figure. A blank is a real answer here.
 *   - Sites refused permission are recorded with status "cancelled" so the
 *     dataset shows what was blocked, not only what was built.
 *
 * Do not hand-edit. Regenerate from the research batch, or amend through the
 * investigations edit-log so the change is attributed.
 */

import type { DatacenterSource } from "@/server/db/schema";
import type { SeedDatacenter, SeedBrand, SeedSupplier } from "./types";
import type { SeedPermit } from "./permits";
import type { SeedSubsidy } from "./subsidies";
import type { CapexUpdate } from "./capex";
import type { OwnershipEdgeSeed, NewBrandSeed } from "./ownership";

/** Renewable / carbon-free pledge, keyed by brand slug. */
export type RefreshCommitment = {
  slug: string;
  pct: number;
  year: number;
  url: string;
  notes?: string;
};

/**
 * A subsidy that a public body REFUSED, or that the applicant withdrew.
 *
 * The canonical `SeedSubsidy` type has no status field, so a refusal stored
 * there would be indistinguishable from an award. These are kept in a separate
 * array — and deliberately NOT seeded — until the `subsidy` table can carry a
 * decision. Dropping them instead would leave only the approvals, which is
 * exactly the bias this dataset exists to counter.
 *
 * `awardedBy` names the body that made the decision, the same as on an award.
 * `announcedDate` is the date of the decision.
 *
 * `denied-then-reversed` records a refusal that a later vote overturned. The
 * granted outcome lives in `REFRESH_2026_07_SUBSIDIES`; this entry preserves the
 * initial "no" so the sequence is not lost, which for a contested abatement is
 * often the story.
 */
export type RefusedSubsidy = SeedSubsidy & {
  decision: "denied" | "withdrawn" | "denied-then-reversed";
};

void (null as unknown as DatacenterSource);

export const REFRESH_2026_07_DATACENTERS: SeedDatacenter[] = [
  {
    slug: "crusoe-childress-tx",
    name: "Crusoe / Lancium Childress AI Data Center Campus",
    operatorSlug: "crusoe",
    status: "announced",
    aiDedicated: true,
    lat: 34.4265,
    lng: -100.2043,
    city: "Childress",
    region: "TX",
    country: "US",
    capacityMwPlanned: 1000,
    primaryPowerSource: "grid-mixed",
    coolingType: "closed-loop",
    description:
      "Announced 15 July 2026 by Crusoe and Lancium as a 1.0 GW AI data center campus on 270 acres of Lancium-owned land in Childress County, Texas. Crusoe designs, builds and operates; Lancium owns the land and manages power interconnection and energy infrastructure. Construction is stated to begin in Q3 2026, with a closed-loop non-evaporative liquid cooling system.",
    sources: [
      {
        url: "https://www.crusoe.ai/resources/newsroom/crusoe-and-lancium-announce-1-gigawatt-ai-data-center-campus-in-childress-texas",
        title:
          "Crusoe and Lancium Announce 1.0 Gigawatt AI Data Center Campus in Childress, Texas",
        type: "pr",
        publishedAt: "2026-07-15",
      },
      {
        url: "https://www.crusoe.ai/resources/newsroom",
        title: "Crusoe Newsroom",
        type: "operator",
      },
    ],
  },
  {
    slug: "crusoe-abilene-microsoft-tx",
    name: "Crusoe Abilene AI Factory Campus (Microsoft)",
    operatorSlug: "crusoe",
    status: "under-construction",
    aiDedicated: true,
    lat: 32.4487,
    lng: -99.7331,
    city: "Abilene",
    region: "TX",
    country: "US",
    capacityMwPlanned: 900,
    primaryPowerSource: "grid-mixed",
    description:
      "A 900 MW Crusoe-built AI factory campus in Abilene, Texas developed for Microsoft, described by Crusoe on 9 June 2026 as having recently broken ground. It is a separate campus from the 1.2 GW Crusoe/Oracle Abilene campus. Exact parcel coordinates are not disclosed; the point given is the city of Abilene.",
    sources: [
      {
        url: "https://www.crusoe.ai/resources/newsroom/crusoes-contracted-ai-infrastructure-capacity-approaches-5-gigawatts-across-data-centers-and-cloud",
        title:
          "Crusoe's Contracted AI Infrastructure Capacity Approaches 5 Gigawatts Across Data Centers and Cloud",
        type: "pr",
        publishedAt: "2026-06-09",
      },
    ],
  },
  {
    slug: "core-scientific-muskogee-ok",
    name: "Core Scientific Muskogee Campus",
    operatorSlug: "core-scientific",
    status: "expanding",
    aiDedicated: true,
    lat: 35.7479,
    lng: -95.3697,
    city: "Muskogee",
    region: "OK",
    country: "US",
    capacityMw: 70,
    capacityMwPlanned: 1000,
    primaryPowerSource: "grid-mixed",
    description:
      "On 6 May 2026 Core Scientific announced a plan to scale its Muskogee, Oklahoma high-density colocation campus to approximately 1.5 GW of gross power (about 1.0 GW leasable). The plan includes acquiring Polaris DS LLC, which holds 440 MW of gross power contracted with Oklahoma Gas & Electric, plus roughly 250 acres of additional land. A leased 70 MW building built for the NVIDIA GB300 platform was in commissioning for Q2 2026 delivery, and construction had begun on a second, unleased 82.5 MW building targeted for Q4 2027. Core Scientific describes itself as repurposing its remaining bitcoin mining facilities for high-density colocation.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1839341/000162828026030918/exhibit991polarispressre.htm",
        title:
          "Core Scientific Plans Expansion to 1.5 Gigawatts of Gross Power at Muskogee, Oklahoma Campus (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-05-06",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1839341/000183934126000012/amdpr.htm",
        title:
          "Core Scientific and AMD Announce Infrastructure Partnership (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-28",
      },
    ],
  },
  {
    slug: "terawulf-muskie-eastpark-ky",
    name: "TeraWulf Muskie Data Campus",
    operatorSlug: "terawulf",
    status: "announced",
    aiDedicated: true,
    lat: 38.4784,
    lng: -82.6379,
    city: "Ashland",
    region: "KY",
    country: "US",
    capacityMwPlanned: 1000,
    primaryPowerSource: "grid-mixed",
    description:
      "Acquired by TeraWulf from Industrial Equity Partners and announced 26 May 2026 as the Muskie Data Campus, a hyperscale HPC/AI development site inside the 1,000-acre EastPark Industrial Park in northeastern Kentucky, with roughly 285 acres owned and controlled. TeraWulf expects the site to support more than 1 GW over time, with an initial 500 MW ramping from the second half of 2028 and a further 500 MW targeted for the second half of 2030. Kentucky Power (AEP) is building a 345 kV substation tied to the existing 765 kV network. The site is already zoned; permitting is under way. Coordinates are city-level for Ashland, Kentucky; the exact parcel is not disclosed.",
    utilitySlug: "aep-ohio",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1083301/000108330126000109/wulfeasternkypr5-26x26.htm",
        title:
          "TeraWulf Expands Infrastructure Platform with Acquisition of 1+ GW Eastern Kentucky HPC Campus (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-05-26",
      },
    ],
  },
  {
    slug: "terawulf-justified-hawesville-ky",
    name: "TeraWulf Justified Data Campus",
    operatorSlug: "terawulf",
    status: "under-construction",
    aiDedicated: true,
    lat: 37.8998,
    lng: -86.755,
    city: "Hawesville",
    region: "KY",
    country: "US",
    capacityMwPlanned: 480,
    primaryPowerSource: "grid-mixed",
    description:
      "TeraWulf's Justified Data Campus at Hawesville, Hancock County, Kentucky, on a former industrial site TeraWulf acquired in February 2026. On 6 July 2026 TeraWulf subsidiary Raylan Data LLC signed a 20-year lease with Anthropic PBC for approximately 401 MW of critical IT load, expected to generate roughly $19 billion of contracted revenue over the initial term. Capacity is to be delivered in phases starting in the second half of 2027 and reaching the full 401 MW by early 2028. TeraWulf separately describes the campus as 480 MW.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1083301/000110465926080583/tm2619468d1_ex99-1.htm",
        title:
          "TeraWulf Announces Anthropic Lease at Justified Data Campus and Sale of Majority Interest in Abernathy Joint Venture to Fluidstack (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-06",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1083301/000110465926080583/tm2619468d1_8k.htm",
        title: "TeraWulf Inc. Form 8-K, 6 July 2026 (Item 8.01)",
        type: "filing",
        publishedAt: "2026-07-06",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1083301/000108330126000109/wulfeasternkypr5-26x26.htm",
        title:
          "TeraWulf Expands Infrastructure Platform with Acquisition of 1+ GW Eastern Kentucky HPC Campus (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-05-26",
      },
    ],
  },
  {
    slug: "fluidstack-abernathy-tx",
    name: "Fluidstack Abernathy AI Data Center Campus",
    operatorSlug: "fluidstack",
    status: "under-construction",
    aiDedicated: true,
    lat: 33.8354,
    lng: -101.8449,
    city: "Abernathy",
    region: "TX",
    country: "US",
    capacityMwPlanned: 168,
    primaryPowerSource: "grid-mixed",
    description:
      "A 168 MW critical-IT-load AI data center campus in Abernathy, Texas, originally developed by a joint venture formed in 2025 between TeraWulf and Fluidstack. On 6 July 2026 TeraWulf agreed to sell its entire 50.1% interest in the joint venture to an investor group led by Fluidstack for approximately $530 million, with Fluidstack continuing to lead the project.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1083301/000110465926080583/tm2619468d1_ex99-1.htm",
        title:
          "TeraWulf Announces Anthropic Lease at Justified Data Campus and Sale of Majority Interest in Abernathy Joint Venture to Fluidstack (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-06",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1083301/000110465926080583/tm2619468d1_8k.htm",
        title:
          "TeraWulf Inc. Form 8-K, 6 July 2026 (Item 8.01, Abernathy Transaction)",
        type: "filing",
        publishedAt: "2026-07-06",
      },
    ],
  },
  {
    slug: "hut8-river-bend-la",
    name: "Hut 8 River Bend AI Data Center Campus",
    operatorSlug: "hut8",
    status: "under-construction",
    aiDedicated: true,
    lat: 30.7813,
    lng: -91.3776,
    city: "St. Francisville",
    region: "LA",
    country: "US",
    capacityMw: 245,
    capacityMwPlanned: 330,
    primaryPowerSource: "grid-mixed",
    description:
      "Hut 8's 330 MW AI data center campus in West Feliciana Parish, Louisiana, near St. Francisville. On 27 April 2026 Hut 8 subsidiary Hut 8 DC LLC priced and completed a $3.25 billion offering of 6.192% senior secured notes due 2042 to finance a turnkey data center with 245 MW of critical IT capacity and the related substation. Hut 8 reported the campus advancing toward Q2 2027 delivery.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1964789/000110465926049810/tm2612880d1_ex99-1.htm",
        title:
          "Hut 8 Announces Pricing of $3.25 Billion of Investment-Grade Senior Secured Notes for River Bend Data Center Project (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-04-27",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1964789/000110465926053247/tm2613163d1_8k.htm",
        title:
          "Hut 8 Corp. Form 8-K, 1 May 2026 (Item 1.01, River Bend notes completion)",
        type: "filing",
        publishedAt: "2026-05-01",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1964789/000110465926055894/hut-20260506xex99d1.htm",
        title:
          "Hut 8 Reports First Quarter 2026 Results (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-05-06",
      },
    ],
  },
  {
    slug: "hut8-beacon-point-nueces-tx",
    name: "Hut 8 Beacon Point AI Data Center Campus",
    operatorSlug: "hut8",
    status: "under-construction",
    aiDedicated: true,
    lat: 27.75,
    lng: -97.5,
    region: "TX",
    country: "US",
    capacityMw: 704,
    capacityMwPlanned: 704,
    primaryPowerSource: "grid-mixed",
    description:
      "Hut 8's second greenfield AI data center campus, on an approximately 521-acre property in Nueces County, Texas, with 1,000 MW of utility capacity secured under an interconnection agreement with AEP Texas. A first 15-year, 352 MW IT lease with a high-investment-grade tenant was reported in Hut 8's Q1 2026 results, financed by a $4.25 billion offering of 6.129% senior secured notes due 2042 priced 4 June 2026. On 20 July 2026 the same tenant signed a second 15-year, 352 MW lease worth $9.8 billion, doubling contracted capacity to 704 MW and taking campus base-term contract value to $19.6 billion. Coordinates are county-level; the exact parcel is not disclosed.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1964789/000110465926084862/tm2620835d1_ex99-1.htm",
        title:
          "Hut 8 Fully Commercializes 1 GW Beacon Point AI Data Center Campus with Second 352 MW IT Lease (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-20",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1964789/000110465926070744/tm2616926d1_ex99-1.htm",
        title:
          "Hut 8 Announces Pricing of $4.25 Billion of Investment-Grade Senior Secured Notes for Beacon Point Data Center Project (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-06-04",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1964789/000110465926055894/hut-20260506xex99d1.htm",
        title:
          "Hut 8 Reports First Quarter 2026 Results (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-05-06",
      },
    ],
  },
  {
    slug: "cipher-stingray-andrews-tx",
    name: "Cipher Stingray HPC Data Center",
    operatorSlug: "cipher-mining",
    status: "under-construction",
    aiDedicated: true,
    lat: 32.3187,
    lng: -102.5457,
    city: "Andrews",
    region: "TX",
    country: "US",
    capacityMw: 70,
    capacityMwPlanned: 100,
    primaryPowerSource: "grid-mixed",
    description:
      "A purpose-built HPC data center in Andrews, Texas developed by Cipher Digital Inc. (formerly Cipher Mining Inc.), with 100 gross MW and 70 MW of critical IT load leased to Amazon Data Services under a 15-year lease worth approximately $2.0 billion in base-term payments. Substation energization is targeted for Q4 2026 with initial rent commencing 1 April 2027. Stingray Compute LLC priced $810 million of 6.000% senior secured notes due 2031 on 8 June 2026 and closed the offering on 15 June 2026 to finance the remaining project cost.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1819989/000095010326008635/dp248110_ex9901.htm",
        title:
          "Stingray Compute investor presentation, June 2026 (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-06-08",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1819989/000095010326008994/dp248453_8k.htm",
        title:
          "Cipher Digital Inc. Form 8-K, 15 June 2026 (Item 1.01, Stingray senior secured notes)",
        type: "filing",
        publishedAt: "2026-06-15",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1819989/000181998926000025/exh992cipherdigital_busi.htm",
        title:
          "Cipher Digital Q1 2026 business update presentation (Form 8-K Exhibit 99.2)",
        type: "filing",
        publishedAt: "2026-05-05",
      },
    ],
  },
  {
    slug: "digi-power-x-columbiana-al",
    name: "Digi Power X Columbiana AI Data Center Campus",
    operatorSlug: "digi-power-x",
    status: "under-construction",
    aiDedicated: true,
    lat: 33.1793,
    lng: -86.6086,
    city: "Columbiana",
    region: "AL",
    country: "US",
    capacityMwPlanned: 40,
    primaryPowerSource: "grid-mixed",
    description:
      "AI data center campus in Columbiana, Alabama operated by Digi Power X Inc. (formerly Digihost Technology Inc., a bitcoin miner). On 4 May 2026 the company signed a ten-year Data Center Colocation and Master Services Agreement with Cerebras Systems for approximately 40 MW, giving Cerebras an exclusive licence to the facility; contract value is about $1.1 billion over the initial term and up to about $2.5 billion with one seven-year extension. Phase 1 of 15 MW targets a ready-for-service date of 15 December 2026, with the full 40 MW targeted by the end of the first fiscal quarter of 2027, the additional 25 MW conditional on financing.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1854368/000121390026053566/ea0289585-8k_digi.htm",
        title:
          "Digi Power X Inc. Form 8-K, 8 May 2026 (Item 1.01, Cerebras colocation agreement)",
        type: "filing",
        publishedAt: "2026-05-08",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1854368/000121390026075755/ea029720301ex99-1.htm",
        title:
          "Digi Power X Provides Operations and Financial Update (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-07",
      },
    ],
  },
  {
    slug: "nebius-independence-mo",
    name: "Nebius Independence AI Factory",
    operatorSlug: "nebius",
    status: "under-construction",
    aiDedicated: true,
    lat: 39.0911,
    lng: -94.4155,
    city: "Independence",
    region: "MO",
    country: "US",
    primaryPowerSource: "grid-mixed",
    description:
      "Nebius broke ground on 12 May 2026 on a gigawatt-scale AI factory on roughly 400 acres in eastern Independence, Missouri. The first phase represents an investment of about $1 billion, with approximately 1,200 construction jobs and 130 permanent operational roles at full capacity, and an estimated $650 million in tax payments over 20 years. Specific megawatt figures for the first phase were not disclosed. Coordinates are city-level.",
    sources: [
      {
        url: "https://nebius.com/newsroom/nebius-breaks-ground-on-gigawatt-scale-ai-factory-in-independence-missouri",
        title:
          "Nebius breaks ground on gigawatt-scale AI factory in Independence, Missouri",
        type: "pr",
        publishedAt: "2026-05-12",
      },
      {
        url: "https://nebius.com/newsroom",
        title: "Nebius newsroom",
        type: "operator",
      },
    ],
  },
  {
    slug: "mara-matagorda-county-tx",
    name: "MARA Matagorda County Digital Infrastructure Campus",
    operatorSlug: "mara",
    status: "announced",
    aiDedicated: false,
    lat: 28.9828,
    lng: -95.9694,
    city: "Bay City",
    region: "TX",
    country: "US",
    capacityMwPlanned: 2000,
    primaryPowerSource: "grid-mixed",
    description:
      "On 2 July 2026 MARA subsidiary Volt Texas, LLC acquired project company MAT 1177 LLC from HIF USA LLC, announced 9 July 2026, giving MARA a powered land site of more than 1,200 acres in Matagorda County, Texas, about 90 miles southwest of Houston. A letter agreement with an electric utility covers up to 2,000 MW, with up to 1 GW of grid capacity expected by October 2027 and up to 2 GW by April 2028. MARA intends to develop the site with Starwood Digital Ventures for high-performance computing as well as flexible compute including bitcoin mining; purchase price is up to $600 million in milestone payments. Coordinates are county-level (Bay City, the county seat); the exact parcel is not disclosed.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1507605/000095014226002012/eh260804074_ex9901.htm",
        title:
          "MARA Signs Agreement with HIF to Acquire Strategic Powered Land Site in Texas (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-09",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1507605/000095014226002012/eh260804074_8k.htm",
        title:
          "MARA Holdings, Inc. Form 8-K, 9 July 2026 (Items 1.01 and 2.01)",
        type: "filing",
        publishedAt: "2026-07-09",
      },
    ],
  },
  {
    slug: "applied-digital-delta-forge-boyce-la",
    name: "Applied Digital Delta Forge 1",
    operatorSlug: "applied-digital",
    status: "under-construction",
    aiDedicated: true,
    lat: 31.3888,
    lng: -92.6779,
    city: "Boyce",
    region: "LA",
    country: "US",
    capacityMw: 300,
    capacityMwPlanned: 430,
    primaryPowerSource: "grid-mixed",
    description:
      "Applied Digital's fourth AI Factory campus, a 430 MW site on more than 500 acres in Boyce, Louisiana. A 15-year take-or-pay lease with a US-based high-investment-grade hyperscaler covers 300 MW of critical IT load for approximately $7.5 billion of base-term contracted revenue. Applied Digital's fiscal Q4 2026 results, published 27 July 2026, place the campus in construction with initial operations expected in calendar 2027. The campus location was first confirmed publicly in that results release.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1144879/000114487926000044/apldq426earningsreleaseasf.htm",
        title:
          "Applied Digital Reports Fiscal Fourth Quarter 2026 Results (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-27",
      },
      {
        url: "https://ir.applieddigital.com/news-events/press-releases/detail/149/applied-digital-announces-new-u-s-based-high",
        title:
          "Applied Digital Announces New U.S. Based High Investment-Grade Hyperscaler Tenant at Delta Forge 1, a 430 MW AI Factory Campus",
        type: "pr",
        publishedAt: "2026-04-23",
      },
      {
        url: "https://www.opportunitylouisiana.gov/news/central-louisiana-secures-3-6-billion-applied-digital-ai-factory-campus",
        title:
          "Central Louisiana Secures $3.6 Billion Applied Digital AI Factory Campus",
        type: "pr",
        publishedAt: "2026-05-26",
      },
    ],
  },
  {
    slug: "applied-digital-polaris-forge-2-harwood-nd",
    name: "Applied Digital Polaris Forge 2",
    operatorSlug: "applied-digital",
    status: "under-construction",
    aiDedicated: true,
    lat: 46.8719,
    lng: -96.8792,
    city: "Harwood",
    region: "ND",
    country: "US",
    capacityMwPlanned: 200,
    primaryPowerSource: "grid-mixed",
    description:
      "Applied Digital's second AI Factory campus, at Harwood, North Dakota. During the quarter ended 31 May 2026 the company completed a $2.15 billion private offering of 6.750% senior secured notes due 2031 through subsidiary APLD ComputeCo 2 LLC to fund development of 200 MW of critical IT load at the campus. Applied Digital's fiscal Q4 2026 results place Polaris Forge 2 in construction.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1144879/000114487926000044/apldq426earningsreleaseasf.htm",
        title:
          "Applied Digital Reports Fiscal Fourth Quarter 2026 Results (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-07-27",
      },
    ],
  },
  {
    slug: "nscale-narvik-no",
    name: "Nscale Narvik AI Data Centre",
    operatorSlug: "nscale",
    status: "under-construction",
    aiDedicated: true,
    lat: 68.5333,
    lng: 17.5667,
    city: "Bjerkvik",
    region: "Nordland",
    country: "NO",
    primaryPowerSource: "hydro",
    description:
      "Nscale's AI data centre at Bjerkvik outside Narvik, Norway, in development since 2025. On 11 May 2026 Nscale announced $790 million of financing to support its AI infrastructure build-out in Norway, and on 6 July 2026 it formed Nordscale Operations AS with local utility Nordkraft (Nscale Norway 51%, Nordkraft 49%) to operate the site, with recruitment under way and operations starting in 2026. Capacity was not disclosed in the fetched releases.",
    sources: [
      {
        url: "https://nscale.com/press-releases/nordscale",
        title:
          "Nscale and Nordkraft Enter Strategic Partnership to Support Data Center Operations in Narvik",
        type: "pr",
        publishedAt: "2026-07-06",
      },
      {
        url: "https://nscale.com/newsroom",
        title: "Nscale newsroom",
        type: "operator",
      },
      {
        url: "https://www.nscale.com/press-releases/nscale-secures-790-million-norway",
        title:
          "Nscale Secures $790 Million in Financing to Support AI Infrastructure Buildout in Norway",
        type: "operator",
        publishedAt: "2026-05-11",
      },
    ],
  },
  {
    slug: "bitfarms-moses-lake-wa",
    name: "Keel Infrastructure Moses Lake HPC/AI Site",
    operatorSlug: "bitfarms",
    status: "announced",
    aiDedicated: true,
    lat: 47.1301,
    lng: -119.2781,
    city: "Moses Lake",
    region: "WA",
    country: "US",
    primaryPowerSource: "grid-mixed",
    description:
      "A Washington State site of Keel Infrastructure Corp., the company formerly named Bitfarms Ltd, being redeveloped from bitcoin mining to HPC/AI use. In its 11 May 2026 first-quarter results Keel reported zoning approvals secured and land development and environmental permits in progress at Moses Lake, alongside Panther Creek and Sharon, and said its liquidity funds the site through lease execution and start of construction. Capacity was not disclosed in the primary filing; a trade-press report of an 18 MW conversion could not be fetched and is treated as unverified.",
    sources: [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1812477/000121390026054167/ea028991401ex99-1.htm",
        title:
          "Keel Infrastructure Reports First Quarter 2026 Results (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-05-11",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/bitfarms-to-convert-washington-cryptomine-to-hpcai-hosting/",
        title: "Bitfarms to convert Washington cryptomine to HPC/AI hosting",
        type: "news",
      },
    ],
  },
  {
    slug: "airtrunk-jhb2-johor",
    name: "AirTrunk JHB2",
    operatorSlug: "airtrunk",
    status: "announced",
    aiDedicated: false,
    lat: 1.434,
    lng: 103.622,
    city: "Iskandar Puteri",
    region: "Johor",
    country: "MY",
    capacityMwPlanned: 270,
    description:
      "Greenfield hyperscale data centre planned on land adjacent to AirTrunk's operational JHB1 site in Iskandar, Johor Bahru. IFC's disclosure describes JHB1 as a 150+MW fully contracted facility and JHB2 as a 270+MW greenfield development on the adjacent site. IFC approved up to US$175m of combined debt and equity across the two on 29 May 2026; the project was disclosed on 13 July 2026 and was listed as pending signing.",
    sources: [
      {
        url: "https://disclosures.ifc.org/project-detail/SII/52336/airtrunk-johor",
        title: "AirTrunk Johor — IFC Project Information Portal",
        type: "filing",
        publishedAt: "2026-07-13",
      },
    ],
  },
  {
    slug: "global-data-infrastructure-kota-seri-langat",
    name: "Global Data Infrastructure Kota Seri Langat",
    operatorSlug: "global-telecommunications-group",
    status: "announced",
    aiDedicated: false,
    lat: 2.82,
    lng: 101.52,
    city: "Banting",
    region: "Selangor",
    country: "MY",
    capacityMwPlanned: 210,
    description:
      "Global Data Infrastructure Sdn Bhd bought a 36-acre plot at the COMPASS @ Kota Seri Langat industrial park in Selangor and intends to build a facility requiring 300MVA of power load and 210MW of IT load. Seller COMPASS IP Sdn Bhd is a joint venture of PNB, KWAP and the AREA group. The sale represents full take-up of the 220-acre park; construction is to start after completion of the sale. The price was not disclosed.",
    sources: [
      {
        url: "https://theedgemalaysia.com/node/809871",
        title:
          "COMPASS IP sells 36-acre plot at the COMPASS @ KSL Industrial Park",
        type: "news",
        publishedAt: "2026-07-08",
      },
    ],
  },
  {
    slug: "nextdc-kl1-kuala-lumpur",
    name: "NEXTDC KL1 Kuala Lumpur",
    operatorSlug: "nextdc",
    status: "operational",
    aiDedicated: true,
    lat: 3.1073,
    lng: 101.6067,
    city: "Petaling Jaya",
    region: "Selangor",
    country: "MY",
    capacityMw: 65,
    description:
      "NEXTDC's first Malaysian facility went live on 14 May 2026 with 65MW of IT capacity in the Klang Valley. The company describes it as the first Uptime Institute Tier IV certified data centre in Peninsular Malaysia and cites an A$1bn (about RM2.8bn) investment. It is NEXTDC's first facility outside Australia.",
    sources: [
      {
        url: "https://www.nextdc.com/news/nextdc-goes-live-with-kl1-kuala-lumpur-launching-strategic-ai-ready-data-centre-in-southeast-asia",
        title:
          "NEXTDC goes live with KL1 Kuala Lumpur, launching strategic AI-ready data centre in Southeast Asia",
        type: "operator",
        publishedAt: "2026-05-14",
      },
    ],
  },
  {
    slug: "equinix-kl2-cyberjaya",
    name: "Equinix KL2",
    operatorSlug: "equinix",
    status: "announced",
    aiDedicated: true,
    lat: 2.9213,
    lng: 101.6559,
    city: "Cyberjaya",
    region: "Selangor",
    country: "MY",
    description:
      "Equinix announced a US$190m investment in KL2, its fourth Malaysian data centre, sited less than 1km from its existing KL1 facility in Cyberjaya. Reported at more than 2,200 cabinets at full build-out; no MW figure was disclosed. Equinix says KL2 plans to be powered by renewable energy from its first day of operations.",
    sources: [
      {
        url: "https://w.media/equinix-to-invest-us-190-million-to-build-new-data-center-in-cyberjaya-malaysia/",
        title:
          "Equinix to invest US$190 million to build new data center in Cyberjaya, Malaysia",
        type: "news",
        publishedAt: "2026-05-13",
      },
    ],
  },
  {
    slug: "alibaba-cloud-johor-my-region-2",
    name: "Alibaba Cloud Malaysia (Johor) availability zones",
    operatorSlug: "alibaba-cloud",
    status: "operational",
    aiDedicated: false,
    lat: 1.4927,
    lng: 103.7414,
    city: "Johor Bahru",
    region: "Johor",
    country: "MY",
    description:
      "Alibaba Cloud launched two data centres in Johor forming its second public cloud region in Malaysia, taking it to five facilities in the country. No per-facility capacity was disclosed. The launch was attributed to Alibaba's previously announced RM223bn (US$53bn) AI and cloud infrastructure programme.",
    sources: [
      {
        url: "https://w.media/alibaba-cloud-launches-two-data-centers-in-johor/",
        title: "Alibaba Cloud launches two data centers in Johor",
        type: "news",
        publishedAt: "2026-06-16",
      },
    ],
  },
  {
    slug: "firmus-dayone-batam-ai-factory",
    name: "Firmus / DayOne Batam AI Factory Campus",
    operatorSlug: "firmus",
    status: "announced",
    aiDedicated: true,
    lat: 1.12,
    lng: 104.16,
    city: "Batam",
    region: "Riau Islands",
    country: "ID",
    capacityMwPlanned: 360,
    description:
      "Firmus Technologies and DayOne announced a 360MW AI factory campus at the Kabil Industrial Estate on Batam, to host up to 170,000 Nvidia accelerators under an agreement running to 2034. The build uses Firmus's liquid-cooled HyperCube architecture co-designed to Nvidia DSX blueprints. Reporting states PLN Batam will deliver 450MW of grid capacity in phases across 2026 and 2027.",
    sources: [
      {
        url: "https://firmus.co/newsroom/firmus-to-build-170-000-gpu-ai-factor-y-campus-with-nvidia-for-global-ai-natives",
        title:
          "Firmus to Build 170,000 GPU AI Factory Campus with NVIDIA for Global AI-Natives",
        type: "operator",
        publishedAt: "2026-06",
      },
      {
        url: "https://www.mingtiandi.com/real-estate/data-centres/dayone-firmus-building-360mw-data-centre-campus-in-batam",
        title: "DayOne, Firmus Building 360MW Data Centre Campus in Batam",
        type: "news",
        publishedAt: "2026-06-30",
      },
    ],
  },
  {
    slug: "true-idc-bangkok-7",
    name: "True IDC Bangkok 7",
    operatorSlug: "true-idc",
    status: "announced",
    aiDedicated: true,
    lat: 13.7563,
    lng: 100.5018,
    city: "Bangkok",
    region: "Bangkok",
    country: "TH",
    description:
      "True Internet Data Center (Charoen Pokphand Group) announced its seventh Thai data centre, an AI-focused hyperscale facility in northern Bangkok, with a 6 billion baht (US$181m) investment and operations targeted for Q3 2027. The design supports both air-cooled and liquid-cooled deployments depending on customer requirement. No IT capacity figure was disclosed.",
    sources: [
      {
        url: "https://w.media/true-idc-invests-us-181-million-in-seventh-data-center-in-bangkok/",
        title:
          "True IDC invests US$181 million in seventh data center in Bangkok",
        type: "news",
        publishedAt: "2026-06-23",
      },
    ],
  },
  {
    slug: "ntt-bangkok-4-chonburi",
    name: "NTT Bangkok 4 (BKK4)",
    operatorSlug: "ntt",
    status: "announced",
    aiDedicated: false,
    lat: 13.367,
    lng: 101.013,
    city: "Chonburi",
    region: "Chonburi",
    country: "TH",
    description:
      "NTT Global Data Centers' Bangkok 4 site in the Chonburi industrial area, which together with BKK2, BKK3 and the newly secured BKK5 land forms NTT GDC's Chonburi campus. NTT signed a 100MW power purchase agreement with Amata B.Grimm Power for the BKK4 site. In July 2026 NTT GDC and Fuji Electric broke ground on a 115kV gas-insulated switchgear substation serving the campus. IT capacity for BKK4 has not been disclosed.",
    sources: [
      {
        url: "https://w.media/ntt-gdc-fuji-electric-break-ground-on-ntts-new-data-center-substation-in-thailand/",
        title:
          "NTT GDC & Fuji Electric break ground on NTT's new data center substation in Thailand",
        type: "news",
        publishedAt: "2026-07-15",
      },
      {
        url: "https://w.media/ntt-global-data-centers-secures-land-to-build-new-bangkok-5-facility-in-chonburi-thailand/",
        title:
          "NTT Global Data Centers secures land to build new Bangkok 5 facility in Chonburi, Thailand",
        type: "news",
        publishedAt: "2026-02-10",
      },
    ],
  },
  {
    slug: "soya-green-data-center-1-wakkanai",
    name: "Soya Green Data Center I",
    operatorSlug: "toyota-tsusho",
    status: "under-construction",
    aiDedicated: false,
    lat: 45.4156,
    lng: 141.673,
    city: "Wakkanai",
    region: "Hokkaido",
    country: "JP",
    capacityMw: 3,
    primaryPowerSource: "wind",
    description:
      "Toyota Tsusho and Eurus Energy Holdings are building what they describe as Japan's first data centre supplied directly by a wind farm over a private transmission line, on a 9,900 sqm site next to the 42MW Kabaoka wind farm in Wakkanai. Receiving capacity is 3MW. Construction started in April 2026, a pillar-raising ceremony was held on 21 July 2026, and full operation is targeted for 2027. The companies say they will separately consider a next-phase 10-20MW data centre around 2030; that is a distinct future project, not this facility's build-out.",
    sources: [
      {
        url: "https://www.toyota-tsusho.com/english/press/detail/260114_006756.html",
        title:
          "Commencement of Japan's First Green Data Center Business Directly Connected to a Wind Power Plant",
        type: "pr",
        publishedAt: "2026-01-14",
      },
      {
        url: "https://cafe-dc.com/japan/eurus-energy-toyota-break-ground-on-wind-powered-data-center-in-hokkaido-japan/",
        title:
          "ユーラスエナジーと豊田通商、北海道で風力発電を活用したデータセンターの立柱式を実施",
        type: "news",
        publishedAt: "2026-07-27",
      },
    ],
  },
  {
    slug: "itc-yangkou-rudong-jiangsu",
    name: "ITC Yangkou Port AI Computing Campus",
    operatorSlug: "itc-properties",
    status: "announced",
    aiDedicated: true,
    lat: 32.56,
    lng: 121.34,
    city: "Rudong",
    region: "Jiangsu",
    country: "CN",
    capacityMwPlanned: 1000,
    description:
      "Hong Kong-listed ITC Properties signed a non-binding memorandum with the management committee of the Yangkou Port Economic Development Zone in Rudong county, Nantong, Jiangsu, to develop a 1GW data centre campus in phases over five years, with a 200MW first phase accommodating up to 1,667 high-density cabinets. The local committee would assist with green electricity arrangements. The memorandum is subject to feasibility studies, customer commitments, financing, energy arrangements and regulatory approvals, and ITC has no prior data centre track record.",
    sources: [
      {
        url: "https://www.mingtiandi.com/real-estate/data-centres/hong-kongs-itc-plans-1gw-jiangsu-data-centre-campus-in-digital-pivot/",
        title:
          "Hong Kong's ITC Plans 1GW Jiangsu Data Centre Campus in Digital Pivot",
        type: "news",
        publishedAt: "2026-07-22",
      },
    ],
  },
  {
    slug: "pohang-gwangmyeong-ai-data-center",
    name: "Pohang Gwangmyeong AI Data Center",
    operatorSlug: "neoai-cloud",
    status: "under-construction",
    aiDedicated: true,
    lat: 35.965,
    lng: 129.365,
    city: "Pohang",
    region: "Gyeongsangbuk-do",
    country: "KR",
    capacityMwPlanned: 300,
    description:
      "Ground was broken on 20 July 2026 at the Gwangmyeong General Industrial Complex in Ocheon, Pohang, for an AI data centre built in two phases: a 40MW first phase targeted for completion in 2027 and a second phase of about 260MW. The investor is NeoAI Cloud, the contractor is Hyundai Engineering and Construction, and the project vehicle is AI Factory Pohang PFV. Around 2 trillion won of private investment is committed. Pohang City ran an expedited approval process covering grid assessment and building permits.",
    sources: [
      {
        url: "https://en.sedaily.com/society/2026/07/20/pohang-breaks-ground-on-40mw-ai-data-center-completion-set",
        title:
          "Pohang Breaks Ground on 40MW AI Data Center, Completion Set for Next Year",
        type: "news",
        publishedAt: "2026-07-20",
      },
      {
        url: "https://www.kyongbuk.co.kr/news/articleView.html?idxno=4078756",
        title: "포항, 글로벌 AI 데이터센터 착공…2조원 민간투자 본궤도",
        type: "news",
        publishedAt: "2026-07-20",
      },
    ],
  },
  {
    slug: "gs-donghae-bukpyeong-ai-campus",
    name: "GS Donghae Bukpyeong AI Data Center Campus",
    operatorSlug: "gs-group",
    status: "announced",
    aiDedicated: true,
    lat: 37.515,
    lng: 129.105,
    city: "Donghae",
    region: "Gangwon-do",
    country: "KR",
    capacityMwPlanned: 2400,
    description:
      "Gangwon Special Self-Governing Province, Donghae City and GS signed a business agreement for an AI data centre campus on a 231,000 sqm parcel at the Bukpyeong 2 General Industrial Complex: 1.2GW targeted operational in 2028 and a further 1.2GW in 2029, with a stated 30 trillion won (about US$19.9bn) investment. GS is to use nearby existing power infrastructure that is reported to be running at about 30 percent of capacity because of transmission expansion delays.",
    sources: [
      {
        url: "https://w.media/gangwon-and-gs-sign-agreement-for-2-4-gw-ai-data-center-campus-in-donghae/",
        title:
          "Gangwon and GS sign agreement for 2.4 GW AI data center campus in Donghae",
        type: "news",
        publishedAt: "2026-07-08",
      },
    ],
  },
  {
    slug: "stt-gdc-seoul-1",
    name: "STT Seoul 1",
    operatorSlug: "stt-gdc",
    status: "operational",
    aiDedicated: false,
    lat: 37.477,
    lng: 126.888,
    city: "Seoul",
    region: "Seoul",
    country: "KR",
    capacityMw: 30,
    description:
      "STT GDC opened its first South Korean facility in Gasan-dong, Geumcheon-gu, Seoul, in June 2026: up to 30MW IT load across about 40,000 sqm gross floor area, run as a 60-40 joint venture with Hyosung Heavy Industries. Design PUE is stated below 1.3 and the building is LEED Gold certified.",
    sources: [
      {
        url: "https://w.media/stt-gdc-opens-first-data-center-in-south-korea/",
        title: "STT GDC opens first data center in South Korea",
        type: "news",
        publishedAt: "2026-06-17",
      },
    ],
  },
  {
    slug: "goodman-project-pluto-guildford-west",
    name: "Goodman Project Pluto",
    operatorSlug: "goodman-group",
    status: "announced",
    aiDedicated: false,
    lat: -33.849,
    lng: 150.966,
    city: "Guildford West",
    region: "NSW",
    country: "AU",
    capacityMwPlanned: 68,
    coolingType: "open-loop",
    description:
      "The NSW Department of Planning, Housing and Infrastructure approved Goodman's state significant development at 132 McCredie Road, Guildford West, on 24 July 2026. A 29,444 sqm building with nine data halls is delivered in two stages: 34MW across five data halls, then four more halls to an ultimate 68MW, on a 71,710 sqm former Castrol site. Capital investment value is A$1.11bn, the design targets a maximum PUE of 1.4 with annualised projections of 1.27-1.32, and cooling is water-cooled chillers with open cooling towers.",
    sources: [
      {
        url: "https://w.media/nsw-approves-goodmans-aud-1-1bn-project-pluto-data-centre-in-western-sydney/",
        title:
          "NSW approves Goodman's AUD 1.1bn Project Pluto data centre in Western Sydney",
        type: "news",
        publishedAt: "2026-07-24",
      },
    ],
  },
  {
    slug: "nextdc-s7-eastern-creek",
    name: "NEXTDC S7 Sydney",
    operatorSlug: "nextdc",
    status: "announced",
    aiDedicated: true,
    lat: -33.802,
    lng: 150.856,
    city: "Eastern Creek",
    region: "NSW",
    country: "AU",
    capacityMwPlanned: 612,
    description:
      "NEXTDC's planned S7 hyperscale campus at Eastern Creek in western Sydney. The NSW state significant development application SSD-113934740 describes 'construction and operation of a data centre with an operational capacity of 612 MW comprising of three, two-storey data storage buildings including 340 back-up diesel generators, diesel fuel storage, on-site substation, site works and car parking'; the application is at the prepare-EIS stage. NEXTDC's own site lists S7 as in planning and describes it as 'a future 550MW+ hyperscale data centre', so the operator figure and the planning figure differ; the planning application figure is used here.",
    sources: [
      {
        url: "https://www.planningportal.nsw.gov.au/major-projects/projects/nextdc-s7-data-centre-eastern-creek",
        title: "NEXTDC S7 Data Centre, Eastern Creek (SSD-113934740)",
        type: "permit",
        publishedAt: "2026-04",
      },
      {
        url: "https://www.nextdc.com/data-centres/sydney-data-centres/s7-sydney",
        title: "S7 Sydney Data Centre In Planning",
        type: "operator",
      },
    ],
  },
  {
    slug: "firmus-project-southgate-south-australia",
    name: "Firmus Project Southgate (Tailem Bend / Stirling North)",
    operatorSlug: "firmus",
    status: "announced",
    aiDedicated: true,
    lat: -35.253,
    lng: 139.456,
    city: "Tailem Bend",
    region: "SA",
    country: "AU",
    capacityMwPlanned: 600,
    description:
      "Firmus signed a 12-year, 600MW firm electricity supply agreement with Gunvor Group for its Project Southgate AI factory campuses at Tailem Bend and Stirling North, South Australia. The agreement is linked to 1.2GW of new renewable generation and 1.5GWh of new battery storage by 2032, including the 200MW/800MWh Koolunga battery energy storage system. Firmus must curtail load for up to 220 hours a year when wholesale prices exceed agreed thresholds.",
    sources: [
      {
        url: "https://firmus.co/newsroom/firmus-secures-600-mw-energy-supply-agreement-in-south-australia-linked-to-1-2-gw-of-new-renewable-generation-and-battery-storage",
        title:
          "Firmus secures 600 MW energy supply agreement in South Australia, linked to 1.2 GW of new renewable generation and battery storage",
        type: "operator",
        publishedAt: "2026-06",
      },
    ],
  },
  {
    slug: "aws-bharat-future-city-telangana",
    name: "AWS Bharat Future City Data Center",
    operatorSlug: "aws",
    status: "under-construction",
    aiDedicated: false,
    lat: 17.15,
    lng: 78.55,
    city: "Bharat Future City",
    region: "TG",
    country: "IN",
    description:
      "AWS broke ground on a new data centre development at Bharat Future City, Telangana, part of its Asia Pacific (Hyderabad) region, with Telangana Chief Minister A. Revanth Reddy attending. AWS restated a plan to invest more than US$21bn in Indian cloud infrastructure between 2026 and 2030 across its Hyderabad and Mumbai regions; no capacity figure was given for this site.",
    sources: [
      {
        url: "https://w.media/aws-breaks-ground-for-new-dc-in-hyderabad-plans-us-21-billion-investment-in-india/",
        title:
          "AWS breaks ground for new DC in Hyderabad, plans US$21 billion investment in India",
        type: "news",
        publishedAt: "2026-07-17",
      },
    ],
  },
  {
    slug: "airtrunk-raigad-pen-maharashtra",
    name: "AirTrunk Raigad Pen Campus",
    operatorSlug: "airtrunk",
    status: "announced",
    aiDedicated: true,
    lat: 18.737,
    lng: 73.095,
    city: "Pen",
    region: "MH",
    country: "IN",
    capacityMwPlanned: 3000,
    description:
      "Maharashtra Chief Minister Devendra Fadnavis said the state exchanged a letter of intent with AirTrunk for land allotment at the Raigad Pen Growth Centre (Orange City) for a data centre, citing a 2 trillion rupee (about US$21bn) investment and 3GW of capacity. At the time of the announcement this was a land letter of intent only, not a permitted or financed build.",
    sources: [
      {
        url: "https://www.forbes.com/sites/yessarrosendar/2026/06/03/billionaire-robin-khudas-airtrunk-to-invest-21-billion-in-data-center-project-near-mumbai/",
        title:
          "Billionaire Robin Khuda's AirTrunk To Invest $21 Billion In Data Center Project Near Mumbai",
        type: "news",
        publishedAt: "2026-06-03",
      },
    ],
  },
  {
    slug: "digital-edge-palava-mumbai",
    name: "Digital Edge Palava Campus",
    operatorSlug: "digital-edge",
    status: "announced",
    aiDedicated: true,
    lat: 19.152,
    lng: 73.098,
    city: "Palava",
    region: "MH",
    country: "IN",
    capacityMwPlanned: 270,
    description:
      "Digital Edge is reported to have bought about 30 acres at Palava, roughly 45km north-east of Mumbai, from Lodha for around 10 billion rupees (about US$104m), for a 270MW hyperscale campus. The underlying report was by The Economic Times citing an anonymous source. Lodha acknowledged the land transaction in an NSE filing, describing land purchases as routine, but did not confirm the data centre; Digital Edge had not confirmed the project publicly.",
    sources: [
      {
        url: "https://w.media/palava-land-deal-points-to-digital-edges-second-india-data-center/",
        title:
          "Palava land deal points to Digital Edge's second India data center",
        type: "news",
        publishedAt: "2026-07-13",
      },
    ],
  },
  {
    slug: "telangana-data-center-city-aloor",
    name: "Telangana Data Center City, Aloor",
    operatorSlug: "telangana-government",
    status: "announced",
    aiDedicated: false,
    lat: 17.32,
    lng: 78.14,
    city: "Chevella",
    region: "TG",
    country: "IN",
    description:
      "The Telangana government identified 1,500 acres at Aloor village in Chevella mandal, about 55km from Hyderabad, for a dedicated 'data center city'. Chief Minister A. Revanth Reddy directed officials in June 2026 to prepare detailed infrastructure requirements. No operator, capacity or investment figure has been attached to the site. The state separately reports about 11GW of data centre capacity from signed memoranda, which is a pledge rather than permitted capacity.",
    sources: [
      {
        url: "https://w.media/telangana-reveals-plans-to-build-a-1500-acre-data-center-city",
        title: "Telangana reveals plans to build a 1,500-acre data center city",
        type: "news",
        publishedAt: "2026-07-01",
      },
    ],
  },
  {
    slug: "g-group-g-campus-hoa-lac-hanoi",
    name: "G-Group G-Campus Hoa Lac",
    operatorSlug: "g-group",
    status: "announced",
    aiDedicated: true,
    lat: 21.011,
    lng: 105.523,
    city: "Hanoi",
    region: "Hanoi",
    country: "VN",
    capacityMw: 20,
    capacityMwPlanned: 30,
    description:
      "G-Group Technology Corporation received an investment certificate at Hanoi's investment promotion conference for G-Campus at Hoa Lac: a campus of more than 38,000 sqm with a Tier III data centre sized at 20MW initially and expandable to 30MW, plus AI and cybersecurity R&D zones across four functional zones. Stated investment is VND7,600bn (about US$300m).",
    sources: [
      {
        url: "https://technode.global/2026/07/01/vietnams-g-group-to-invest-300m-in-building-ai-data-center-campus-in-hanoi",
        title:
          "Vietnam's G-Group to invest $300M in building AI data center campus in Hanoi",
        type: "news",
        publishedAt: "2026-07-01",
      },
    ],
  },
  {
    slug: "letsia-hyperdc-riyadh",
    name: "Letsia HyperDC Riyadh",
    operatorSlug: "letsia",
    status: "announced",
    aiDedicated: false,
    lat: 24.7136,
    lng: 46.6753,
    city: "Riyadh",
    region: "Riyadh",
    country: "SA",
    description:
      "Letsia is developing HyperDC, a Tier III facility on an 8,000 sqm plot in Riyadh with a 5,200 sqm first-phase built-up area, targeting a PUE under 1.4. Stated investment is SAR50m (about US$13.32m) and a pilot operational phase is expected in February 2027. The project was first announced in May 2026 and the source describes it as under development without stating that construction has begun. No IT capacity figure was disclosed.",
    sources: [
      {
        url: "https://w.media/letsia-to-invest-us-13-32-million-into-green-data-center-development-in-riyadh/",
        title:
          "Letsia to invest US$13.32 million into green data center development in Riyadh",
        type: "news",
        publishedAt: "2026-07-14",
      },
    ],
  },
  {
    slug: "hassan-allam-digital-egypt-dc1",
    name: "Hassan Allam Digital Infrastructure and Data Centre",
    operatorSlug: "hassan-allam-digital",
    status: "announced",
    aiDedicated: false,
    lat: 30.0444,
    lng: 31.2357,
    city: "Cairo",
    region: "Cairo",
    country: "EG",
    description:
      "Egypt's National Telecommunications Regulatory Authority granted Hassan Allam Digital Infrastructure and Data Centre Solutions a licence on 15 June 2026 to establish and operate data centres and provide cloud services, for a project with a stated US$400m initial phase delivered with Egyptian technology firm A15. The licence announcement did not name a specific site or give a capacity figure; the NTRA said ten data centre licences have been issued over the past two years. Coordinates are placed at Cairo pending a named location.",
    sources: [
      {
        url: "https://developingtelecoms.com/telecom-technology/data-centres-networks/20398-egypt-approves-major-data-centre-project.html",
        title: "Egypt approves major data centre project",
        type: "news",
        publishedAt: "2026-06-16",
      },
    ],
  },
  {
    slug: "income-alexandria-egypt",
    name: "Income Alexandria Data Center",
    operatorSlug: "income-igi",
    status: "announced",
    aiDedicated: false,
    lat: 31.2001,
    lng: 29.9187,
    city: "Alexandria",
    region: "Alexandria",
    country: "EG",
    description:
      "Infrastructure firm Income said it would invest about US$280m in a data centre near Alexandria, Egypt. Only the investment figure and the general location could be verified from a retrievable source; reported detail placing the site at Borg El Arab with a 100MW initial power allocation rising to 400MW comes from a trade article that could not be fetched and is recorded here as unverified. Coordinates are placed at Alexandria pending a confirmed site.",
    sources: [
      {
        url: "https://datacentrenews.substack.com/p/weekly-data-centre-news-24072026",
        title: "Weekly Data Centre News - 24/07/2026",
        type: "news",
        publishedAt: "2026-07-24",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/income-to-invest-280m-in-data-center-near-alexandria-egypt/",
        title: "Income to invest $280m in data center near Alexandria, Egypt",
        type: "news",
        publishedAt: "2026-07",
      },
    ],
  },
  {
    slug: "raxio-tz1-dar-es-salaam",
    name: "Raxio TZ1",
    operatorSlug: "raxio",
    status: "announced",
    aiDedicated: false,
    lat: -6.7924,
    lng: 39.2083,
    city: "Dar es Salaam",
    region: "Dar es Salaam",
    country: "TZ",
    capacityMwPlanned: 6,
    description:
      "Raxio is developing TZ1 on the outskirts of Dar es Salaam: 6MW of IT capacity and 800 racks across about 4,000 sqm, described as Tanzania's first carrier-neutral Tier III facility, with launch planned during 2026. The source states Raxio is 'planning to launch' the facility and does not confirm that construction is under way. Raxio said committed shareholder capital rose to US$380m as Meridiam and Roha increased their backing.",
    sources: [
      {
        url: "https://w.media/raxios-tz1-to-add-6-mw-and-800-racks-to-tanzanias-data-center-market/",
        title:
          "Raxio's TZ1 to add 6 MW and 800 racks to Tanzania's data center market",
        type: "news",
        publishedAt: "2026-07-14",
      },
    ],
  },
  {
    slug: "cybastion-cote-divoire-national-dc",
    name: "Cybastion Côte d'Ivoire Sovereign National Data Centre",
    operatorSlug: "cybastion",
    status: "announced",
    aiDedicated: false,
    lat: 5.36,
    lng: -4.0083,
    city: "Abidjan",
    region: "Abidjan",
    country: "CI",
    description:
      "The Ivorian government gave approval on 16 July 2026 to a US$170m programme by US firm Cybastion, financed by the US Export-Import Bank, covering a sovereign national data centre, a government digitisation platform and a smart border surveillance system, delivered in partnership with Cisco. No site or capacity was disclosed; coordinates are placed at Abidjan pending a named location.",
    sources: [
      {
        url: "https://techafricanews.com/2026/07/17/us-expands-cote-divoire-tech-footprint-with-starlink-approval-and-170m-data-centre-project/",
        title:
          "US Expands Côte d'Ivoire Tech Footprint with Starlink Approval and $170M Data Centre Project",
        type: "news",
        publishedAt: "2026-07-17",
      },
    ],
  },
  {
    slug: "g42-microsoft-olkaria-kenya",
    name: "Microsoft / G42 Olkaria Geothermal AI Campus",
    operatorSlug: "g42",
    status: "announced",
    aiDedicated: true,
    lat: -0.895,
    lng: 36.295,
    city: "Olkaria",
    region: "Nakuru",
    country: "KE",
    capacityMwPlanned: 1000,
    primaryPowerSource: "geothermal",
    description:
      "The Microsoft/G42 geothermal-powered campus at Olkaria, billed at 100MW rising to 1GW and reported as a US$1bn investment, has been paused. President William Ruto is quoted saying 'to switch on that one data centre, we would need to shut off power for half the country'; Kenya's grid cannot support the load. No restart date has been given.",
    sources: [
      {
        url: "https://w.media/special-report-african-power-how-digital-transformation-is-sparking-an-energy-revolution-across-the-continent/",
        title:
          "SPECIAL REPORT | African power: how digital transformation is sparking an energy revolution across the continent",
        type: "news",
        publishedAt: "2026-07-24",
      },
      {
        url: "https://datacentrenews.substack.com/p/weekly-data-centre-news-08052026",
        title: "Weekly Data Centre News - 08/05/2026",
        type: "news",
        publishedAt: "2026-05-08",
      },
    ],
  },
  {
    slug: "kasi-cloud-lekki-lagos",
    name: "Kasi Cloud Lekki Campus (LOS1)",
    operatorSlug: "kasi-cloud",
    status: "operational",
    aiDedicated: true,
    lat: 6.44,
    lng: 3.53,
    city: "Lekki",
    region: "Lagos",
    country: "NG",
    capacityMwPlanned: 100,
    description:
      "Nigerian operator Kasi Cloud Datacenters commissioned the first building, LOS1, of its Lekki campus in the Maiyegun area of Lagos on 19 May 2026. The roughly four-hectare campus is designed to scale to about 100MW of critical IT capacity at full development. Phase-one live capacity was not stated in the company announcement. Trade reporting puts the campus investment at US$250m.",
    sources: [
      {
        url: "https://www.globenewswire.com/news-release/2026/05/19/3297917/0/en/Kasi-Cloud-Datacenters-Commissions-West-Africa-s-First-Hyperscale-Ready-AI-Capable-Data-Centre-Campus-in-Lagos.html",
        title:
          "Kasi Cloud Datacenters Commissions West Africa's First Hyperscale-Ready, AI-Capable Data Centre Campus in Lagos",
        type: "pr",
        publishedAt: "2026-05-19",
      },
      {
        url: "https://w.media/special-report-african-power-how-digital-transformation-is-sparking-an-energy-revolution-across-the-continent/",
        title:
          "SPECIAL REPORT | African power: how digital transformation is sparking an energy revolution across the continent",
        type: "news",
        publishedAt: "2026-07-24",
      },
    ],
  },
  {
    slug: "bytedance-pecem-ceara",
    name: "ByteDance Pecém Data Center Campus",
    operatorSlug: "bytedance",
    status: "under-construction",
    aiDedicated: true,
    lat: -3.545,
    lng: -38.81,
    city: "Pecém",
    region: "CE",
    country: "BR",
    capacityMwPlanned: 1000,
    description:
      "ByteDance began construction of a campus at the Pecém port complex in Ceará, reported as its largest facility outside China. Initial capacity is about 200MW across 20 halls, scaling toward nearly 1GW, with first operations targeted for late 2027. Reported investment is R$200bn (about US$38.44bn). Brazilian platform Omnia is handling construction and pitched the Ceará location to ByteDance in 2025; no power purchase agreement was detailed in the retrievable sources.",
    sources: [
      {
        url: "https://w.media/bytedance-begins-construction-of-us-38-44-billion-data-center-in-brazil",
        title:
          "ByteDance begins construction of US$38.44 billion data center in Brazil",
        type: "news",
        publishedAt: "2026-07-02",
      },
    ],
  },
  {
    slug: "ada-gru10-franco-da-rocha",
    name: "Ada Infrastructure GRU10",
    operatorSlug: "ada-infrastructure",
    status: "under-construction",
    aiDedicated: true,
    lat: -23.323,
    lng: -46.726,
    city: "Franco da Rocha",
    region: "SP",
    country: "BR",
    capacityMwPlanned: 300,
    description:
      "Ada Infrastructure, owned by Ares Management, started construction in June 2026 on the first phase of its GRU10 campus at Franco da Rocha in Greater São Paulo, its first project in Latin America. Full build-out is up to three buildings totalling 300MW served by two local substations, with about R$2.7bn (US$520m) of investment through 2030. The first phase covers one building and one substation with an estimated 18-24 month construction period. Google is expected to occupy one of the data centres. The project was first announced in 2023 and grid connection approval came in 2025.",
    sources: [
      {
        url: "https://www.bnamericas.com/en/analysis/after-three-years-ada-starts-construction-of-300mw-data-center-in-sao-paulo",
        title:
          "After three years, Ada starts construction of 300MW data center in São Paulo",
        type: "news",
        publishedAt: "2026-06-26",
      },
    ],
  },
  {
    slug: "elea-bel1-belem",
    name: "Elea BEL1",
    operatorSlug: "elea-data-centers",
    status: "announced",
    aiDedicated: true,
    lat: -1.43,
    lng: -48.47,
    city: "Belém",
    region: "PA",
    country: "BR",
    capacityMw: 7.5,
    capacityMwPlanned: 100,
    description:
      "Elea Data Centers announced BEL1 at Belém, Pará, presented as the Amazon region's first AI data centre. Initial capacity is 7.5MW with expansion potential to 100MW in future phases, sited near AXIA Energia's Miramar high-voltage substation and supplied under a 100 percent renewable power purchase agreement with AXIA. Operations are expected in the second quarter of 2027.",
    sources: [
      {
        url: "https://eleadatacenters.com/en/2026/06/26/elea-announces-the-amazon-regions-first-ai-data-center-with-power-infrastructure-from-axia-energia",
        title:
          "Elea announces the Amazon region's first AI data center, with power infrastructure from AXIA Energia",
        type: "pr",
        publishedAt: "2026-06-26",
      },
    ],
  },
  {
    slug: "softbank-loon-plage-dunkirk",
    name: "SoftBank Dunkirk (Loon-Plage) AI Data Center",
    operatorSlug: "softbank",
    status: "announced",
    aiDedicated: true,
    lat: 50.9975,
    lng: 2.2075,
    city: "Loon-Plage",
    region: "Hauts-de-France",
    country: "FR",
    primaryPowerSource: "grid-mixed",
    description:
      "One of three Hauts-de-France sites in SoftBank Group's announced 5 GW French AI data center programme, disclosed at the 2026 Choose France summit. Per-site capacity was not broken out; SoftBank stated a first phase of 3.1 GW across the three sites by 2031 and named Schneider Electric as industrial partner at the Port of Dunkirk.",
    sources: [
      {
        url: "https://group.softbank/en/news/press/20260531_0",
        title:
          "SoftBank Group to Build 5 GW of AI Data Center Capacity in France",
        type: "pr",
        publishedAt: "2026-05-31",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-june-2026",
        title: "New Data Center Developments: June 2026",
        type: "news",
        publishedAt: "2026-06-30",
      },
    ],
  },
  {
    slug: "softbank-bosquel",
    name: "SoftBank Bosquel AI Data Center",
    operatorSlug: "softbank",
    status: "announced",
    aiDedicated: true,
    lat: 49.7906,
    lng: 2.2483,
    city: "Le Bosquel",
    region: "Hauts-de-France",
    country: "FR",
    primaryPowerSource: "grid-mixed",
    description:
      "Second of three Hauts-de-France sites named in SoftBank Group's 5 GW French AI data center announcement of 30-31 May 2026. Per-site capacity was not disclosed; the three sites together are stated to deliver 3.1 GW by 2031 for an initial EUR 45bn.",
    sources: [
      {
        url: "https://group.softbank/en/news/press/20260531_0",
        title:
          "SoftBank Group to Build 5 GW of AI Data Center Capacity in France",
        type: "pr",
        publishedAt: "2026-05-31",
      },
    ],
  },
  {
    slug: "softbank-bouchain",
    name: "SoftBank Bouchain AI Data Center",
    operatorSlug: "softbank",
    status: "announced",
    aiDedicated: true,
    lat: 50.2861,
    lng: 3.3161,
    city: "Bouchain",
    region: "Hauts-de-France",
    country: "FR",
    primaryPowerSource: "grid-mixed",
    description:
      "Third of three Hauts-de-France sites in SoftBank Group's 5 GW French AI data center announcement. SoftBank stated that EDF will supply low-carbon power to the Bouchain facility. Per-site capacity was not disclosed.",
    sources: [
      {
        url: "https://group.softbank/en/news/press/20260531_0",
        title:
          "SoftBank Group to Build 5 GW of AI Data Center Capacity in France",
        type: "pr",
        publishedAt: "2026-05-31",
      },
    ],
  },
  {
    slug: "verne-ile-de-france-ardian-campus",
    name: "Verne / Ardian Ile-de-France Digital Infrastructure Campus",
    operatorSlug: "verne",
    status: "announced",
    aiDedicated: true,
    lat: 48.8566,
    lng: 2.3522,
    region: "Ile-de-France",
    country: "FR",
    capacityMwPlanned: 500,
    primaryPowerSource: "grid-mixed",
    description:
      "Ardian and Verne announced a 500 MW HPC and AI-training campus in Ile-de-France on 1 June 2026 at the Choose France summit, with an initial phase of more than 200 MW targeted by 2030 and investment of up to EUR 5bn. The site is intended to support the AION consortium's bid for a French AI Gigafactory under the EU AI Gigafactories initiative. The exact commune was not disclosed; coordinates given are the Ile-de-France reference point, not the plot.",
    sources: [
      {
        url: "https://www.ardian.com/news-insights/press-releases/ardian-and-verne-announce-digital-infrastructure-hub-ile-de-france",
        title:
          "Ardian and Verne announce digital infrastructure hub in Ile-de-France to support European industrial capabilities at Choose France",
        type: "pr",
        publishedAt: "2026-06-01",
      },
      {
        url: "https://www.verne.co/news/news-at-choose-france-ardian-and-verne-announce-plans-for-a-digital-infrastructure-campus-in-%C3%AEle-de-france-to-strengthen-europes-industrial-and-ai-capacity",
        title:
          "At Choose France, Ardian and Verne announce plans for a digital infrastructure campus in Ile-de-France",
        type: "operator",
        publishedAt: "2026-06-01",
      },
    ],
  },
  {
    slug: "alto-infrastructure-sp01-escuzar-granada",
    name: "Alto Infrastructure SP01 Granada",
    operatorSlug: "alto-infrastructure",
    status: "under-construction",
    aiDedicated: true,
    lat: 37.0603,
    lng: -3.7483,
    city: "Escuzar",
    region: "Granada",
    country: "ES",
    capacityMwPlanned: 70,
    coolingType: "direct-to-chip",
    description:
      "Alto Infrastructure broke ground on 30 June 2026 on SP01, an AI/HPC campus in the CITAI industrial and innovation area of Escuzar, Granada. Reported at 70 MW IT capacity (100 MW electrical) at full build in late 2029, with 10 MW IT operational in summer 2027 rising to 25 MW before the end of 2027. Direct-to-chip liquid cooling supporting up to 250 kW per rack; total potential investment reported at EUR 3bn of which about EUR 700m is infrastructure.",
    sources: [
      {
        url: "https://bebeez.eu/2026/06/30/alto-infrastructure-breaks-ground-on-70mw-ai-campus-in-granada-spain/",
        title:
          "Alto Infrastructure breaks ground on 70MW AI campus in Granada, Spain",
        type: "news",
        publishedAt: "2026-06-30",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/alto-infrastructure-launches-a-70-mw-ai-campus-in-granada-with-a-potential-investment-of-3000-millones/",
        title:
          "Alto Infrastructure breaks ground on 70MW AI campus in Granada, Spain",
        type: "news",
        publishedAt: "2026-06-30",
      },
    ],
  },
  {
    slug: "dayone-escatron-aragon",
    name: "DayOne Aragon (Escatron) Campus",
    operatorSlug: "dayone",
    status: "announced",
    aiDedicated: true,
    lat: 41.2925,
    lng: -0.3236,
    city: "Escatron",
    region: "Aragon",
    country: "ES",
    capacityMwPlanned: 300,
    description:
      "DayOne disclosed its first Spanish data center on 10 June 2026: a campus in the municipality of Escatron, near Zaragoza, being developed by renewable energy firm Ignis on a plot of about 900 hectares and designed to scale to 300 MW. Reported cost is more than EUR 3bn. Neither the first-phase size nor a construction timeline had been announced.",
    sources: [
      {
        url: "https://bebeez.eu/2026/06/10/ignis-to-build-dayones-300mw-data-center-in-aragon-spain/",
        title: "Ignis to build DayOne's 300MW data center in Aragon, Spain",
        type: "news",
        publishedAt: "2026-06-10",
      },
    ],
  },
  {
    slug: "equinix-md5-alcobendas-madrid",
    name: "Equinix MD5 Madrid",
    operatorSlug: "equinix",
    status: "operational",
    aiDedicated: false,
    lat: 40.5411,
    lng: -3.6417,
    city: "Alcobendas",
    region: "Madrid",
    country: "ES",
    description:
      "Equinix opened its MD5 International Business Exchange in Alcobendas, Madrid, reported on 27 May 2026. The facility adds over 4,400 sqm of colocation space, uses N+1 power and cooling redundancy and supports liquid cooling; investment reported at EUR 460m. IT capacity in MW was not disclosed.",
    sources: [
      {
        url: "https://w.media/equinix-opens-its-md5-data-center-in-spain/",
        title: "Equinix opens its MD5 data center in Spain",
        type: "news",
        publishedAt: "2026-05-27",
      },
    ],
  },
  {
    slug: "google-horndal-avesta",
    name: "Google Horndal Data Center",
    operatorSlug: "google",
    status: "under-construction",
    aiDedicated: false,
    lat: 60.2861,
    lng: 16.4222,
    city: "Horndal",
    region: "Dalarna",
    country: "SE",
    primaryPowerSource: "grid-mixed",
    description:
      "Google broke ground on 2 June 2026 on its first self-developed, owned and operated data center in Sweden, at Horndal in Avesta municipality on land acquired in 2017. Designed to be ready for off-site heat recovery; Google announced a EUR 5m local community fund and 100 direct full-time jobs. No IT capacity or completion date was disclosed.",
    sources: [
      {
        url: "https://www.googlecloudpresscorner.com/2026-06-02-Google-Breaks-Ground-on-Data-Center-in-Horndal,-Sweden",
        title: "Google Breaks Ground on Data Center in Horndal, Sweden",
        type: "pr",
        publishedAt: "2026-06-02",
      },
    ],
  },
  {
    slug: "atnorth-nor01-haugaland",
    name: "atNorth NOR01 Haugaland",
    operatorSlug: "atnorth",
    status: "announced",
    aiDedicated: true,
    lat: 59.2519,
    lng: 5.4144,
    city: "Gismarvik",
    region: "Rogaland",
    country: "NO",
    capacityMwPlanned: 350,
    description:
      "atNorth announced on 3 June 2026 that it had acquired a 36-hectare plot in Haugaland Business Park for NOR01, its first Norwegian site. Initial phases are stated at 120 MW ramping to 350 MW, with power availability projected for 2028 via two new substations built by Statnett and regional grid operator Fagne.",
    sources: [
      {
        url: "https://www.atnorth.com/news/atnorth-expands-to-norway-with-new-mega-site-in-haugaland/",
        title: "atNorth expands to Norway with new mega site in Haugaland",
        type: "operator",
        publishedAt: "2026-06-03",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-july-2026",
        title: "New Data Center Developments: July 2026",
        type: "news",
        publishedAt: "2026-07-28",
      },
    ],
  },
  {
    slug: "bulk-arendal-longum-nord",
    name: "Bulk Arendal (Longum Nord) Data Center",
    operatorSlug: "bulk-infrastructure",
    status: "announced",
    aiDedicated: false,
    lat: 58.47,
    lng: 8.8,
    city: "Arendal",
    region: "Agder",
    country: "NO",
    capacityMwPlanned: 150,
    description:
      "Arendal municipal council approved the sale of a plot at Longum Nord, inside the Eyde Material Park, to Bulk Data Centers Arendal AS for NOK 600m at a meeting in the week of 25 June 2026. Bulk's presentation to officials targets a 150 MW grid connection by the end of 2029. Coordinates are approximate to the Longum Nord area.",
    sources: [
      {
        url: "https://bebeez.eu/2026/07/02/bulk-buys-land-in-arendal-norway-for-data-center-development/",
        title: "Bulk buys land in Arendal, Norway, for data center development",
        type: "news",
        publishedAt: "2026-07-02",
      },
    ],
  },
  {
    slug: "microsoft-sandnes-rogaland",
    name: "Microsoft Sandnes Data Center",
    operatorSlug: "microsoft",
    status: "announced",
    aiDedicated: false,
    lat: 58.83,
    lng: 5.74,
    city: "Sandnes",
    region: "Rogaland",
    country: "NO",
    capacityMwPlanned: 25,
    description:
      "Microsoft revealed plans at the end of June 2026 for a 25 MW data center in Sandnes municipality, in the Stavanger region, on a plot registered at the end of June for NOK 153.6m and already zoned for industrial and data centre use. The facility would supplement the existing Norway East cloud region; no construction timeline was given. Sources disagree on plot size (reported both as 64 acres and as 64 maal, i.e. about 6.4 hectares).",
    sources: [
      {
        url: "https://www.nordiskpost.com/2026/07/03/norway-microsoft-plans-data-centre-in-sandnes/",
        title: "Norway: Microsoft plans data centre in Sandnes",
        type: "news",
        publishedAt: "2026-07-03",
      },
      {
        url: "https://dataxconnect.com/weekly-data-centre-news-3rd-july-2026/",
        title: "Weekly Data Centre News - 3rd July 2026",
        type: "news",
        publishedAt: "2026-07-03",
      },
    ],
  },
  {
    slug: "arcem-joroinen-fi",
    name: "Arcem Joroinen Data Center Campus",
    operatorSlug: "arcem",
    status: "announced",
    aiDedicated: true,
    lat: 62.1794,
    lng: 27.8306,
    city: "Joroinen",
    region: "Pohjois-Savo",
    country: "FI",
    capacityMwPlanned: 500,
    description:
      "Arcem, the data centre platform of Norwegian developer Bonum, announced on 1 June 2026 an agreement with Joroinen municipality to acquire an approximately 800,000 sqm site adjacent to Fingrid's 400/110 kV Huutokoski transformer station. A first phase of 60 MW is stated for 2027, rising to 100 MW by 2029, with stated potential above 500 MW.",
    sources: [
      {
        url: "https://media.arcem.no/arcem-makes-major-land-acquisition-in-finland/",
        title: "Arcem Makes Major Land Acquisition in Finland",
        type: "operator",
        publishedAt: "2026-06-01",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-july-2026",
        title: "New Data Center Developments: July 2026",
        type: "news",
        publishedAt: "2026-07-28",
      },
    ],
  },
  {
    slug: "amptank-utajarvi-fi",
    name: "AmpTank Utajarvi AI Data Center",
    operatorSlug: "amptank",
    status: "announced",
    aiDedicated: true,
    lat: 64.7614,
    lng: 26.4181,
    city: "Utajarvi",
    region: "Pohjois-Pohjanmaa",
    country: "FI",
    capacityMwPlanned: 200,
    description:
      "AmpTank announced on 11 June 2026 that its Finnish subsidiary Data Tank Nordic Oy had obtained legally valid building permits and signed a binding grid connection agreement for a 200 MW AI data center in Utajarvi. Construction was stated to begin in the second half of 2026, with 200 MW of immediately available power and on-site battery storage for grid stability.",
    sources: [
      {
        url: "https://www.prnewswire.com/news-releases/amptank-announces-200-mw-ai-data-center-project-in-utajarvi-finland-302797940.html",
        title:
          "AmpTank Announces 200 MW AI Data Center Project in Utajarvi, Finland",
        type: "pr",
        publishedAt: "2026-06-11",
      },
    ],
  },
  {
    slug: "pure-dc-seinajoki-sjk01",
    name: "Pure DC SJK01 Seinajoki",
    operatorSlug: "pure-dc",
    status: "under-construction",
    aiDedicated: true,
    lat: 62.7903,
    lng: 22.8403,
    city: "Seinajoki",
    region: "Etela-Pohjanmaa",
    country: "FI",
    capacityMwPlanned: 550,
    description:
      "Pure DC announced EUR 1.3bn of committed senior debt on 21 July 2026 to accelerate SJK01, its Seinajoki AI campus. Phase 1 is permitted at 110 MW and stated as fully leased, with the substation constructed and operational; the full campus is described as 550 MW or more. Lenders named were SMBC, ABN AMRO, Citi, Societe Generale and Natixis CIB.",
    sources: [
      {
        url: "https://www.globenewswire.com/news-release/2026/07/21/3330594/0/en/Pure-DC-Secures-Additional-1-3-Billion-to-Accelerate-Growth-of-One-of-Europe-s-Largest-AI-Campuses.html",
        title:
          "Pure DC Secures Additional EUR1.3 Billion to Accelerate Growth of One of Europe's Largest AI Campuses",
        type: "pr",
        publishedAt: "2026-07-21",
      },
    ],
  },
  {
    slug: "microsoft-grevenbroich-nrw",
    name: "Microsoft Grevenbroich Data Center",
    operatorSlug: "microsoft",
    status: "announced",
    aiDedicated: true,
    lat: 51.0894,
    lng: 6.5872,
    city: "Grevenbroich",
    region: "NRW",
    country: "DE",
    description:
      "Microsoft disclosed on 1 July 2026 that it had signed a conditional land purchase agreement in Grevenbroich, North Rhine-Westphalia, as a fourth site in its Rhenish mining-region cloud and AI cluster after Bedburg, Bergheim and Elsdorf. The purchase is conditional on the city adopting a zoning plan. Site size and capacity were not disclosed.",
    sources: [
      {
        url: "https://bebeez.eu/2026/07/02/microsoft-signs-land-purchase-agreement-for-data-center-in-grevenbroich-germany/",
        title:
          "Microsoft signs land purchase agreement for data center in Grevenbroich, Germany",
        type: "news",
        publishedAt: "2026-07-02",
      },
    ],
  },
  {
    slug: "aws-maintal-hessen",
    name: "AWS Maintal Data Center",
    operatorSlug: "aws",
    status: "announced",
    aiDedicated: false,
    lat: 50.15,
    lng: 8.8333,
    city: "Maintal",
    region: "HE",
    country: "DE",
    primaryPowerSource: "grid-mixed",
    coolingType: "air",
    description:
      "AWS presented plans on 27 May 2026 for a data center in the Maintal-West industrial area north of Frankfurt: about 10.6 hectares hosting two server buildings, a substation and offices, with up to 100 permanent jobs. The mayor put the investment in the billion-euro range and commissioning within five years. AWS stated air cooling for about 95 percent of operating hours and up to 93 percent of additional water needs from stored rainwater. Compute capacity was not disclosed.",
    sources: [
      {
        url: "https://www.hessenschau.de/wirtschaft/rechenzentrum-in-maintal-amazon-tochter-aws-geht-neue-wege-v1,maintal-aws-rechenzentrum-100.html",
        title: "Rechenzentrum in Maintal: Amazon-Tochter AWS geht neue Wege",
        type: "news",
        publishedAt: "2026-05-27",
      },
    ],
  },
  {
    slug: "hscale-mxp2-milan",
    name: "Hscale MXP2 Milan Campus",
    operatorSlug: "hscale",
    status: "announced",
    aiDedicated: false,
    lat: 45.4642,
    lng: 9.19,
    city: "Milan",
    region: "Lombardia",
    country: "IT",
    capacityMwPlanned: 120,
    description:
      "Hscale, a Bain Capital and Aquila Group joint venture, closed the acquisition of a second Milan hyperscale campus in late May 2026. Its own site specification lists MXP2 as a 120 MW campus of three 36 MW buildings with 180 MVA secured and a target ready-for-service date of Q3 2028, liquid-ready with a targeted PUE of 1.2. Combined MXP1 and MXP2 investment is reported at more than EUR 2bn for 250 MW. Sources disagree on the comune: trade press places both campuses at Settimo, northwest Milan, while the operator's own page lists MXP1 as west Milan and MXP2 as east Milan. Coordinates are the Milan reference point, not the plot.",
    sources: [
      {
        url: "https://www.hscaledc.com/data-centres/italy-milan/",
        title: "Italy, Milan | hscale data centres",
        type: "operator",
      },
      {
        url: "https://dataxconnect.com/weekly-data-centre-news-29th-may-2026/",
        title: "Weekly Data Centre News - 29th May 2026",
        type: "news",
        publishedAt: "2026-05-29",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-july-2026",
        title: "New Data Center Developments: July 2026",
        type: "news",
        publishedAt: "2026-07-28",
      },
    ],
  },
  {
    slug: "k2-strategic-milan-south",
    name: "K2 Strategic (Kuok Group) South Milan Campus",
    operatorSlug: "k2-strategic",
    status: "announced",
    aiDedicated: false,
    lat: 45.4642,
    lng: 9.19,
    city: "Milan",
    region: "Lombardia",
    country: "IT",
    capacityMwPlanned: 300,
    description:
      "Italy's industry ministry disclosed on 26 June 2026 that Kuok Group's digital infrastructure arm K2 Strategic is assessing a hyperscale campus of about 300 MW on the southern outskirts of Milan, with development and long-term operation costed at up to EUR 5.3bn. The project was described as a potential investment plan under evaluation, not an approved scheme; the comune was not identified. Coordinates are the Milan reference point.",
    sources: [
      {
        url: "https://www.globalbankingandfinance.com/kuok-group-eyes-5-3-billion-data-center-investment-italy/",
        title:
          "Kuok Group eyes 5.3 billion euro data center investment in Italy",
        type: "news",
        publishedAt: "2026-06-26",
      },
    ],
  },
  {
    slug: "techbau-trino-vercelli",
    name: "Trino Data Center (ex Galileo Ferraris power plant)",
    operatorSlug: "techbau",
    status: "announced",
    aiDedicated: true,
    lat: 45.1953,
    lng: 8.2969,
    city: "Trino",
    region: "Piemonte",
    country: "IT",
    capacityMwPlanned: 400,
    description:
      "A hyperscale campus proposed by Italian developer Techbau on the site of the decommissioned Enel Galileo Ferraris thermoelectric plant at Trino, Vercelli. Reporting on 24 July 2026 put capacity at 300-400 MW (upper bound recorded here) and investment near EUR 4bn, with the services conference to open by end-2026, unified authorisation expected during 2027 and a first section operational by end-2028. The Italian government declared the project of pre-eminent strategic national interest and appointed an extraordinary commissioner for permitting.",
    sources: [
      {
        url: "https://www.lospiffero.com/ls_article.php?id=100717",
        title: "Trino accende il motore dell'Ai. Piemonte hub dei data center",
        type: "news",
        publishedAt: "2026-07-24",
      },
      {
        url: "https://dataxconnect.com/weekly-data-centre-news-29th-may-2026/",
        title: "Weekly Data Centre News - 29th May 2026",
        type: "news",
        publishedAt: "2026-05-29",
      },
    ],
  },
  {
    slug: "edgeconnex-lombardy-campuses",
    name: "EdgeConneX Lombardy Campuses",
    operatorSlug: "edgeconnex",
    status: "announced",
    aiDedicated: false,
    lat: 45.4642,
    lng: 9.19,
    region: "Lombardia",
    country: "IT",
    capacityMwPlanned: 300,
    description:
      "The Italian Prime Minister's office announced on 14 May 2026 that EdgeConneX will build three data centre campuses in the Lombardy region by 2031, totalling more than 300 MW, with EUR 3bn of direct investment. Individual sites were not named; industry minister Adolfo Urso initially cited EUR 6bn before the PM's office clarified the direct figure as EUR 3bn. Coordinates are the Lombardy/Milan reference point, not a plot.",
    sources: [
      {
        url: "https://www.globalbankingandfinance.com/edgeconnex-invest-3-billion-euros-data-centres-italy/",
        title: "EdgeConneX to invest 3 billion euros in data centres in Italy",
        type: "news",
        publishedAt: "2026-05-14",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-june-2026",
        title: "New Data Center Developments: June 2026",
        type: "news",
        publishedAt: "2026-06-30",
      },
    ],
  },
  {
    slug: "twenty20-energy-gryfin-slupsk",
    name: "Twenty20 Energy Gryfin Project (Slupsk / Redzikowo)",
    operatorSlug: "twenty20-energy",
    status: "announced",
    aiDedicated: false,
    lat: 54.4641,
    lng: 17.0285,
    city: "Slupsk",
    region: "Pomorskie",
    country: "PL",
    capacityMwPlanned: 790,
    description:
      "Twenty20 Energy announced on or before 2 July 2026 the Gryfin Project, two data centres in Pomeranian Voivodeship at Slupsk and neighbouring Redzikowo, at a stated cost of PLN 10bn. Construction was stated to begin in 2026 in stages, with 50 MW operational by 2028 and up to 790 MW by 2030. Capacity is project-wide; the split between the two towns was not disclosed, so both are recorded under one entry anchored at Slupsk.",
    sources: [
      {
        url: "https://bebeez.eu/2026/07/02/twenty20-energy-announces-two-data-centers-for-pomeranian-voivodeship-poland/",
        title:
          "Twenty20 Energy announces two data centers for Pomeranian Voivodeship, Poland",
        type: "news",
        publishedAt: "2026-07-02",
      },
    ],
  },
  {
    slug: "corscale-court-lane-iver",
    name: "Corscale Court Lane, Iver",
    operatorSlug: "corscale",
    status: "under-construction",
    aiDedicated: false,
    lat: 51.5147,
    lng: -0.505,
    city: "Iver",
    region: "Buckinghamshire",
    country: "GB",
    capacityMwPlanned: 140,
    description:
      "Corscale appointed McLaren Construction and Phoenix ME under a pre-construction services agreement for a 140 MW, two-building campus with a dedicated 140 MVA substation on a 14-acre site at Court Lane, Iver. Predevelopment works (site clearance, enabling works, utility diversions, environmental remediation) were stated to start on 1 July 2026, with practical completion targeted for Q4 2029. Trade press separately reported that Corscale was still to file for planning permission, so the consent position is unclear.",
    sources: [
      {
        url: "https://www.mclarengroup.com/news/corscale-appoints-mclaren-construction-and-phoenix-me-to-start-predevelopment-of-140mw-iver-data-centre",
        title:
          "Corscale appoints McLaren Construction and Phoenix ME to start predevelopment of 140MW Iver data centre",
        type: "operator",
      },
      {
        url: "https://dataxconnect.com/weekly-data-centre-news-12th-june-2026/",
        title: "Weekly Data Centre News - 12th June 2026",
        type: "news",
        publishedAt: "2026-06-12",
      },
    ],
  },
  {
    slug: "kao-data-park-royal-london",
    name: "Kao Data Park Royal",
    operatorSlug: "kao-data",
    status: "announced",
    aiDedicated: true,
    lat: 51.528,
    lng: -0.27,
    city: "London",
    region: "England",
    country: "GB",
    description:
      "Kao Data announced on 12 May 2026 that it had acquired a 4.7-acre, 107,000 sqft brownfield site on the former Frogmore Industrial Estate in Park Royal, West London, from Reassure Limited (Legal & General) in March 2026. The company stated the facility will support AI, life sciences, healthcare research and financial services workloads and enter service in 2029; detailed planning proposals were still to be submitted. No MW figure was disclosed.",
    sources: [
      {
        url: "https://kaodata.com/discover/news/kao-data-acquires-new-industrial-site-in-park-royal-west-london/",
        title:
          "Kao Data Acquires New Industrial Site in Park Royal, West London",
        type: "operator",
        publishedAt: "2026-05-12",
      },
    ],
  },
  {
    slug: "kao-data-harlow-klon-campus",
    name: "Kao Data Harlow Campus (Nebius deployment)",
    operatorSlug: "kao-data",
    status: "expanding",
    aiDedicated: true,
    lat: 51.755,
    lng: 0.145,
    city: "Harlow",
    region: "Essex",
    country: "GB",
    description:
      "Nebius signed a ten-year, 22 MW capacity agreement at Kao Data's Harlow campus, announced 8 June 2026, to host Nebius AI Cloud and the Nebius Token Factory. It forms part of a GBP 1.7bn UK programme of three new NVIDIA deployments that, with Nebius' existing London site, is stated to reach 65 MW across four sites when fully ramped in 2027. The Harlow campus already operates KLON-01 and KLON-02.",
    sources: [
      {
        url: "https://nebius.com/newsroom/nebius-expands-in-uk-with-more-nvidia-powered-infrastructure-more-customers-and-more-cloud-capabilities-for-agentic-and-enterprise-ai",
        title:
          "Nebius expands in UK with more NVIDIA-powered infrastructure, more customers, and more cloud capabilities for agentic and enterprise AI",
        type: "operator",
        publishedAt: "2026-06-08",
      },
      {
        url: "https://bebeez.eu/2026/06/08/nebius-signs-22mw-capacity-agreement-with-kao-data-in-the-uk/",
        title: "Nebius signs 22MW capacity agreement with Kao Data in the UK",
        type: "news",
        publishedAt: "2026-06-08",
      },
    ],
  },
  {
    slug: "era4-newport-liberty-steel",
    name: "Era4 Newport (former Liberty Steel works)",
    operatorSlug: "era4",
    status: "announced",
    aiDedicated: true,
    lat: 51.555,
    lng: -2.92,
    city: "Newport",
    region: "Wales",
    country: "GB",
    description:
      "Era4's multibillion-pound AI data centre at the former Liberty Steel works in Newport is publicly stalled. Reporting of 16 June 2026 states Era4 had secured permission and financing but that the Department for Science, Innovation and Technology had not approved the project's access to power from a nearby battery plant and gave no indication of when a decision would come; chief executive Tom Humphreys said the company was looking at sites in Europe as an alternative. Not formally cancelled, so status is left as announced.",
    sources: [
      {
        url: "https://www.yahoo.com/news/world/articles/uk-became-data-centre-hub-141607877.html",
        title: "How the UK became a data centre hub",
        type: "news",
        publishedAt: "2026-06-16",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-july-2026",
        title: "New Data Center Developments: July 2026",
        type: "news",
        publishedAt: "2026-07-28",
      },
    ],
  },
  {
    slug: "red-admiral-rochfortbridge-westmeath",
    name: "Red Admiral DC Rochfortbridge Campus",
    operatorSlug: "red-admiral-dc",
    status: "announced",
    aiDedicated: false,
    lat: 53.4147,
    lng: -7.2894,
    city: "Rochfortbridge",
    region: "Westmeath",
    country: "IE",
    description:
      "Westmeath County Council granted Red Admiral DC Ltd (Lumcloon Energy Group) ten-year planning permission in early June 2026, subject to 32 conditions, for a six-unit data centre campus with a decentralised energy resource across roughly 600 acres of townlands near Rochfortbridge. Ten third-party appeals were lodged with An Coimisiun Pleanala (ref PL-501596-WH-26), with the last day for observations 27 July 2026; press reports put the campus at about EUR 1bn and cite an estimate of 493,000 tonnes of CO2 per year. IT capacity was not disclosed.",
    sources: [
      {
        url: "https://www.irishtimes.com/business/2026/07/07/plans-for-1bn-westmeath-data-centre-stalled/",
        title: "Plans for EUR1bn Westmeath data centre stalled",
        type: "news",
        publishedAt: "2026-07-07",
      },
      {
        url: "https://www.westmeathexaminer.ie/2026/07/17/coimisiun-pleanala-consider-10-appeals-over-data-centre/",
        title: "Coimisiun Pleanala consider 10 appeals over data centre",
        type: "news",
        publishedAt: "2026-07-17",
      },
    ],
  },
  {
    slug: "start-campus-sines-building-2",
    name: "Start Campus SINES Data Campus, Second Building",
    operatorSlug: "start-campus",
    status: "announced",
    aiDedicated: true,
    lat: 37.956,
    lng: -8.864,
    city: "Sines",
    region: "Setubal",
    country: "PT",
    capacityMwPlanned: 200,
    description:
      "Nscale announced on 5 May 2026 an expanded agreement with Microsoft and Start Campus covering a second 200 MW building at the SINES Data Campus in Portugal, with EUR 465m committed to that building plus EUR 230m in shared infrastructure. More than 66,000 NVIDIA Rubin NVL72 GPUs are to be deployed starting in late 2027; the wider campus is stated as fully permitted for 1.2 GW.",
    sources: [
      {
        url: "https://www.nscale.com/press-releases/nscale-start-campus",
        title:
          "Nscale to Deliver 66,000+ NVIDIA Rubin GPUs to Microsoft at Start Campus' Site in Portugal",
        type: "operator",
        publishedAt: "2026-05-05",
      },
    ],
  },
  {
    slug: "openai-camellia-effingham-ga",
    name: "OpenAI Project Camellia (Effingham County)",
    operatorSlug: "openai",
    status: "announced",
    aiDedicated: true,
    lat: 32.296,
    lng: -81.2354,
    city: "Rincon",
    region: "GA",
    country: "US",
    capacityMwPlanned: 3200,
    primaryPowerSource: "grid-mixed",
    utilitySlug: "georgia-power",
    coolingType: "closed-loop",
    description:
      "OpenAI-developed campus of four buildings inside the Savannah Gateway Industrial Hub in Effingham County, Georgia, announced 22 July 2026 with a stated $20bn capital investment. Georgia Power is contracted to deliver 3.2 GW in phases between 2028 and 2032.",
    sources: [
      {
        url: "https://openai.com/index/building-ai-infrastructure-with-the-effingham-county-community/",
        title: "Building AI infrastructure with the Effingham County community",
        type: "operator",
        publishedAt: "2026-07-22",
      },
      {
        url: "https://thecurrentga.org/2026/07/22/20-billion-openai-data-center-to-open-in-effingham-county/",
        title: "$20 billion OpenAI data center to open in Effingham County",
        type: "news",
        publishedAt: "2026-07-22",
      },
      {
        url: "https://w.media/openai-plans-to-build-its-own-3-2-gw-data-center-campus-in-georgia/",
        title:
          "OpenAI plans to build its own 3.2 GW data center campus in Georgia",
        type: "news",
        publishedAt: "2026-07-23",
      },
    ],
  },
  {
    slug: "microsoft-la-porte-in",
    name: "Microsoft La Porte Datacenter Campus",
    operatorSlug: "microsoft",
    status: "under-construction",
    aiDedicated: false,
    lat: 41.6106,
    lng: -86.7225,
    city: "La Porte",
    region: "IN",
    country: "US",
    primaryPowerSource: "grid-mixed",
    coolingType: "closed-loop",
    description:
      "Microsoft held a groundbreaking for its La Porte, Indiana datacenter campus on 18 June 2026. The company says the first phase will employ more than 600 permanent staff and use closed-loop liquid cooling.",
    sources: [
      {
        url: "https://local.microsoft.com/blog/microsoft-breaks-ground-on-la-porte-datacenter-project/",
        title: "Microsoft breaks ground on La Porte datacenter project",
        type: "operator",
        publishedAt: "2026-06",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-july-2026",
        title: "New Data Center Developments: July 2026",
        type: "news",
        publishedAt: "2026-07",
      },
    ],
  },
  {
    slug: "microsoft-pecos-tx-kilby",
    name: "Microsoft Pecos (Project Kilby)",
    operatorSlug: "microsoft",
    status: "announced",
    aiDedicated: true,
    lat: 31.4254,
    lng: -103.4953,
    city: "Pecos",
    region: "TX",
    country: "US",
    capacityMwPlanned: 2000,
    primaryPowerSource: "gas",
    description:
      "Microsoft campus in Pecos, west Texas, to be powered by a dedicated 2.67 GW natural-gas plant that Chevron (via Energy Forge One LLC) and Engine No. 1 will build under a 20-year power purchase agreement announced 22 June 2026. First power is targeted for 2028 with a final investment decision expected by end of 2026.",
    sources: [
      {
        url: "https://www.chevron.com/newsroom/2026/q2/chevron-signs-20-year-power-agreement-with-microsoft-for-west-texas-data-center",
        title:
          "Chevron Signs 20-Year Power Agreement with Microsoft for West Texas Data Center",
        type: "pr",
        publishedAt: "2026-06-22",
      },
      {
        url: "https://techcrunch.com/2026/06/22/microsoft-and-chevron-plan-one-of-the-largest-gas-powered-data-center-projects-in-us/",
        title:
          "Microsoft and Chevron plan one of the largest gas-powered data center projects in US",
        type: "news",
        publishedAt: "2026-06-22",
      },
      {
        url: "https://www.chemicalprocessing.com/industrynews/news/55386044/chevron-plans-267-gw-west-texas-power-facility-for-microsoft-data-center",
        title:
          "Chevron Plans 2.67-GW West Texas Power Facility for Microsoft Data Center",
        type: "news",
        publishedAt: "2026-06-23",
      },
    ],
  },
  {
    slug: "google-new-florence-mo",
    name: "Google New Florence Data Center",
    operatorSlug: "google",
    status: "announced",
    aiDedicated: false,
    lat: 38.9103,
    lng: -91.4482,
    city: "New Florence",
    region: "MO",
    country: "US",
    primaryPowerSource: "grid-mixed",
    coolingType: "air",
    description:
      "Google announced a $15bn Missouri infrastructure investment centred on a data center campus at New Florence, Montgomery County, on 21 May 2026. Google will add more than 1 GW of new generation in the state, including 500 MW with Ameren Missouri, and says the site uses advanced air cooling to minimise water use.",
    sources: [
      {
        url: "https://www.powermag.com/google-pledges-power-ratepayer-protections-in-15b-missouri-data-center-expansion/",
        title:
          "Google Pledges Power, Ratepayer Protections in $15B Missouri Data Center Expansion",
        type: "news",
        publishedAt: "2026-05-21",
      },
      {
        url: "https://www.stlpr.org/government-politics-issues/2026-05-21/missouri-governor-google-announce-15-billion-data-center-montgomery-county",
        title:
          "Missouri governor and Google announce $15 billion data center in Montgomery County",
        type: "news",
        publishedAt: "2026-05-21",
      },
      {
        url: "https://governor.mo.gov/press-releases/archive/missouri-secures-15-billion-investment-google-montgomery-county",
        title:
          "Missouri Secures $15 Billion Investment from Google in Montgomery County",
        type: "pr",
        publishedAt: "2026-05-21",
      },
    ],
  },
  {
    slug: "aws-montgomery-county-mo",
    name: "AWS Montgomery County Data Center Campus",
    operatorSlug: "aws",
    status: "announced",
    aiDedicated: false,
    lat: 38.927,
    lng: -91.418,
    city: "New Florence",
    region: "MO",
    country: "US",
    primaryPowerSource: "grid-mixed",
    description:
      "Amazon announced on 15 June 2026 a $10bn data center campus in Montgomery County, Missouri, on roughly 1,000 acres east of New Florence at the I-70 / Missouri 19 interchange. The company states it will create more than 400 full-time roles and will pay 100% of connection and grid costs to Ameren Missouri.",
    sources: [
      {
        url: "https://www.prnewswire.com/news-releases/amazon-selects-missouri-for-10-billion-data-center-campus-302800859.html",
        title: "Amazon Selects Missouri for $10 Billion Data Center Campus",
        type: "pr",
        publishedAt: "2026-06-15",
      },
      {
        url: "https://www.aboutamazon.com/news/company-news/amazon-data-center-missouri-new-jobs",
        title:
          "Amazon announces multibillion-dollar data center investment in Missouri",
        type: "operator",
      },
      {
        url: "https://www.komu.com/news/midmissourinews/amazon-missouri-officials-announce-10b-montgomery-county-data-center-plan/article_cb50e268-0d98-48e6-9c0a-3dc1978aa2c5.html",
        title: "Amazon announces $10B Montgomery County data center plan",
        type: "news",
        publishedAt: "2026-06-15",
      },
    ],
  },
  {
    slug: "stack-berry-hill-va",
    name: "STACK Southern Virginia Megasite at Berry Hill",
    operatorSlug: "stack-infrastructure",
    status: "announced",
    aiDedicated: true,
    lat: 36.5621,
    lng: -79.6039,
    city: "Danville",
    region: "VA",
    country: "US",
    coolingType: "closed-loop",
    description:
      "STACK Infrastructure's AI data center campus on about 2,990 acres at the Southern Virginia Megasite at Berry Hill, Pittsylvania County. Local bodies approved a performance agreement on 18 May 2026 committing STACK to $100bn of investment and 2,500 jobs over 30 years; STACK confirmed on 30 June 2026 that it is proceeding after the state extended its data center tax exemption.",
    sources: [
      {
        url: "https://cardinalnews.org/2026/05/19/a-data-center-project-in-pittsylvania-was-approved-monday-with-higher-investment-and-jobs-than-previously-announced/",
        title:
          "Pittsylvania data center project approved with more investment and jobs than previously announced",
        type: "news",
        publishedAt: "2026-05-19",
      },
      {
        url: "https://cardinalnews.org/2026/06/30/stack-infrastructure-says-its-moving-forward-with-ai-data-center-in-pittsylvania/",
        title:
          "Stack Infrastructure says it's moving forward with AI data center in Pittsylvania",
        type: "news",
        publishedAt: "2026-06-30",
      },
      {
        url: "https://www.wdbj7.com/2026/04/30/new-details-massive-data-center-planned-pittsylvania-county/",
        title:
          "New details out on massive data center planned in Pittsylvania County",
        type: "news",
        publishedAt: "2026-04-30",
      },
    ],
  },
  {
    slug: "digital-realty-de-soto-ks",
    name: "Digital Realty Astra Enterprise Park (De Soto)",
    operatorSlug: "digital-realty",
    status: "announced",
    aiDedicated: false,
    lat: 38.9792,
    lng: -94.9686,
    city: "De Soto",
    region: "KS",
    country: "US",
    capacityMw: 600,
    capacityMwPlanned: 2000,
    primaryPowerSource: "grid-mixed",
    utilitySlug: "evergy",
    description:
      "Digital Realty disclosed on 22 June 2026 the acquisition of roughly 1,440 acres of powered land at Astra Enterprise Park, De Soto, Kansas (former Sunflower Army Ammunition Plant) for about $475m. An energy service agreement with Evergy covers 600 MW by early 2028, rising to 2 GW at full delivery.",
    sources: [
      {
        url: "https://www.globenewswire.com/news-release/2026/06/22/3315175/0/en/Digital-Realty-Announces-Transactions-to-Drive-Continued-Platform-Growth.html",
        title:
          "Digital Realty Announces Transactions to Drive Continued Platform Growth",
        type: "pr",
        publishedAt: "2026-06-22",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/0001297996/000119312526276844/d50837dex992.htm",
        title: "Digital Realty Trust, Inc. — Form 8-K Exhibit 99.2 (FY2026)",
        type: "filing",
        publishedAt: "2026-06-22",
      },
      {
        url: "https://www.commercialsearch.com/news/digital-realty-enters-kansas-city-to-build-600mw-campus/",
        title: "Digital Realty Enters Kansas City, to Build 600MW Campus",
        type: "news",
        publishedAt: "2026-06-25",
      },
      {
        url: "https://constructionreviewonline.com/digital-realty-enters-kansas-city-market-with-2gw-data-center-campus-at-astra-enterprise-park/",
        title:
          "Digital Realty Enters Kansas City Market With 2GW Data Center Campus at Astra Enterprise Park",
        type: "news",
        publishedAt: "2026-06-23",
      },
    ],
  },
  {
    slug: "prime-avondale-phx-az",
    name: "Prime Data Centers Phoenix Campus (Avondale)",
    operatorSlug: "prime-data-centers",
    status: "under-construction",
    aiDedicated: true,
    lat: 33.4356,
    lng: -112.3496,
    city: "Avondale",
    region: "AZ",
    country: "US",
    capacityMwPlanned: 240,
    primaryPowerSource: "grid-mixed",
    coolingType: "closed-loop",
    description:
      "Prime Data Centers broke ground on 21 May 2026 on the first three of five buildings at a 66.5-acre, 240 MW campus in Avondale, Arizona, part of a stated $3bn investment. Each building is 267,000 sq ft with 48 MW of critical IT load; buildings 1-3 are pre-leased to an unnamed hyperscaler.",
    sources: [
      {
        url: "https://primedatacenters.com/news/prime-data-centers-breaks-ground-on-three-buildings-at-its-240mw-phoenix-campus-advancing-3billion-dollar-investment-in-avondale/",
        title:
          "Prime Data Centers Breaks Ground on Three Buildings at its 240MW Campus in Phoenix, Advancing $3B Investment in Avondale",
        type: "pr",
        publishedAt: "2026-05-21",
      },
      {
        url: "https://www.datacenterknowledge.com/data-center-construction/new-data-center-developments-july-2026",
        title: "New Data Center Developments: July 2026",
        type: "news",
        publishedAt: "2026-07",
      },
    ],
  },
  {
    slug: "buzz-hpc-greater-toronto-on",
    name: "BUZZ HPC Greater Toronto Area AI Campus",
    operatorSlug: "buzz-hpc",
    status: "announced",
    aiDedicated: true,
    lat: 43.6532,
    lng: -79.3832,
    region: "ON",
    country: "CA",
    capacityMwPlanned: 320,
    primaryPowerSource: "grid-mixed",
    coolingType: "closed-loop",
    description:
      "BUZZ HPC, a subsidiary of HIVE Digital Technologies, announced on 18 May 2026 the purchase of about 25 contiguous acres in the Greater Toronto Area for CA$58m, with an existing 320 MW utility power allocation. The company plans roughly CA$3.5bn of investment and more than 100,000 GPUs, targeting go-live in the second half of 2027.",
    sources: [
      {
        url: "https://www.hivedigitaltechnologies.com/news/hives-buzz-hpc-announces-320-mw-sovereign-ai-infrastructure-in-greater-toronto-area/",
        title:
          "HIVE's BUZZ HPC Announces 320 MW Sovereign AI Infrastructure in Greater Toronto Area",
        type: "pr",
        publishedAt: "2026-05-18",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1720424/000106299326002783/exhibit99-1.htm",
        title:
          "HIVE's BUZZ HPC Announces 320 MW Sovereign AI Infrastructure in Greater Toronto Area (Form 8-K Exhibit 99.1)",
        type: "filing",
        publishedAt: "2026-05-18",
      },
    ],
  },
  {
    slug: "meta-el-paso-tx",
    name: "Meta El Paso Data Center",
    operatorSlug: "meta",
    status: "under-construction",
    aiDedicated: true,
    lat: 31.7601,
    lng: -106.487,
    city: "El Paso",
    region: "TX",
    country: "US",
    capacityMwPlanned: 1000,
    description:
      "Meta announced on 28 July 2026 a joint venture with BlackRock funds (Global Infrastructure Partners and HPS Investment Partners) to develop its 1 GW El Paso, Texas data center. BlackRock funds hold 80% and Meta 20%; total development cost is put at about $14bn, with capacity starting to come online in 2028. More than 2,300 workers were already on site at announcement.",
    sources: [
      {
        url: "https://about.fb.com/news/2026/07/meta-announces-new-venture-with-blackrock-to-develop-data-center-in-el-paso/",
        title:
          "Meta Announces New Strategic Venture With BlackRock to Develop Data Center in El Paso",
        type: "operator",
        publishedAt: "2026-07-28",
      },
    ],
  },
  {
    slug: "meta-sturgeon-county-ab",
    name: "Meta Sturgeon County Data Centre",
    operatorSlug: "meta",
    status: "under-construction",
    aiDedicated: true,
    lat: 53.8422,
    lng: -113.5407,
    region: "AB",
    country: "CA",
    capacityMwPlanned: 1000,
    primaryPowerSource: "grid-mixed",
    coolingType: "closed-loop",
    description:
      "Meta broke ground in July 2026 on its first Canadian data centre, a 1 GW AI-optimised site in Sturgeon County, Alberta, with stated investment of more than CA$13bn plus about CA$60m in local road and water infrastructure. Cooling is a closed-loop liquid system with dry coolers and no operational water use; Meta says it is fully funding new generation and grid infrastructure via Greenlight LP, AltaLink and Capital Power.",
    sources: [
      {
        url: "https://about.fb.com/news/2026/07/breaking-ground-on-metas-first-data-center-in-canada/",
        title: "Breaking Ground on Meta's First Data Center in Canada",
        type: "operator",
        publishedAt: "2026-07-08",
      },
      {
        url: "https://datacenters.atmeta.com/2026/07/hello-sturgeon-county/",
        title: "Hello, Sturgeon County!",
        type: "operator",
        publishedAt: "2026-07-08",
      },
    ],
  },
  {
    slug: "google-jackson-county-al",
    name: "Google Jackson County Data Center",
    operatorSlug: "google",
    status: "expanding",
    aiDedicated: false,
    lat: 34.8836,
    lng: -85.7552,
    city: "Bridgeport",
    region: "AL",
    country: "US",
    primaryPowerSource: "grid-mixed",
    description:
      "Google said on 15 June 2026 it will invest $1.5bn across 2026 and 2027 to expand its Jackson County, Alabama data center campus, which has operated since 2019 on the repurposed Widows Creek coal plant site. The announcement includes a $2m Energy Impact Fund with TVA and CAANEAL.",
    sources: [
      {
        url: "https://blog.google/innovation-and-ai/infrastructure-and-cloud/global-network/alabama-investment-june-2026/",
        title:
          "Google expands Alabama data center campus, funds community efforts",
        type: "operator",
        publishedAt: "2026-06-15",
      },
    ],
  },
  {
    slug: "aws-clinton-ms",
    name: "AWS Clinton Data Center",
    operatorSlug: "aws",
    status: "under-construction",
    aiDedicated: false,
    lat: 32.3411,
    lng: -90.3216,
    city: "Clinton",
    region: "MS",
    country: "US",
    primaryPowerSource: "grid-mixed",
    description:
      "AWS publicly marked a $1bn data center investment in Clinton, Hinds County, Mississippi on 10 June 2026, converting the former Delphi manufacturing plant. Local officials describe it as the largest private investment in Hinds County history.",
    sources: [
      {
        url: "https://magnoliatribune.com/2026/06/10/aws-marks-1-billion-data-center-investment-in-clinton/",
        title: "AWS marks $1 billion data center investment in Clinton",
        type: "news",
        publishedAt: "2026-06-10",
      },
    ],
  },
  {
    slug: "qts-pw-digital-gateway-va",
    name: "QTS PW Digital Gateway",
    operatorSlug: "qts",
    status: "cancelled",
    aiDedicated: false,
    lat: 38.7988,
    lng: -77.5636,
    city: "Gainesville",
    region: "VA",
    country: "US",
    description:
      "QTS withdrew its remaining legal appeals for the PW Digital Gateway campus along Pageland Lane in Prince William County, Virginia in early July 2026, ending a project sized at up to 27 million sq ft and about $30bn of private investment.",
    sources: [
      {
        url: "https://www.datacenterknowledge.com/data-center-site-selection/second-major-virginia-data-center-project-dies-raising-ai-site-selection-stakes",
        title:
          "Second Major Virginia Data Center Project Dies, Raising AI Site-Selection Stakes",
        type: "news",
        publishedAt: "2026-07-08",
      },
    ],
  },
  {
    slug: "oracle-project-jupiter-dona-ana-nm",
    name: "Project Jupiter (Doña Ana County)",
    operatorSlug: "oracle",
    status: "under-construction",
    aiDedicated: true,
    lat: 31.87,
    lng: -106.6866,
    city: "Santa Teresa",
    region: "NM",
    country: "US",
    capacityMwPlanned: 2500,
    coolingType: "closed-loop",
    description:
      "1,400-acre hyperscale campus north of the Santa Teresa port of entry in Doña Ana County, developed by STACK Infrastructure with BorderPlex Digital Assets and occupied by Oracle to supply OpenAI/Stargate capacity. Coordinates are the Santa Teresa community centroid, not a surveyed parcel; the campus site itself lies north of the port of entry near the Border Connector highway.",
    sources: [
      {
        url: "https://www.organmountainnews.com/project-jupiter-stack-jtip-job-training-funds-2026/",
        title:
          "Project Jupiter developer approved for $3M in state job-training funds",
        type: "news",
        publishedAt: "2026-07",
      },
      {
        url: "https://www.kanw.org/new-mexico-news/2026-07-15/oracle-revises-plans-for-massive-project-jupiter-data-center-to-reduce-emissions",
        title:
          "Oracle revises plans for massive Project Jupiter data center to reduce emissions",
        type: "news",
        publishedAt: "2026-07-15",
      },
      {
        url: "https://www.surnmnoticias.org/southnmnews/fnw4f2xgabeha47gddg2ealaknmhmy",
        title:
          "Project Jupiter: $165B Data Center Proposed in Santa Teresa, Doña Ana County, New Mexico",
        type: "news",
      },
      {
        url: "https://www.stackinfra.com/about/news-press/press-releases/stack-infrastructure-and-borderplex-digital-announce-cumulative-56-9-million-in-water-and-community-commitments-for-dona-ana-county-through-project-jupiter/",
        title:
          "STACK Infrastructure and BorderPlex Digital Announce Cumulative $56.9 Million in Water and Community Commitments for Doña Ana County Through Project Jupiter",
        type: "pr",
        publishedAt: "2025-09-15",
      },
    ],
  },
  {
    slug: "tract-hanover-mountain-road-va",
    name: "Mountain Road Technology Park",
    operatorSlug: "tract",
    status: "cancelled",
    aiDedicated: false,
    lat: 37.6899,
    lng: -77.5423,
    city: "Hanover County",
    region: "VA",
    country: "US",
    description:
      "Tract's proposed ~430-acre data center campus at 13074 Mountain Road / 12517 Winns Church Road; the Hanover County Board of Supervisors denied the rezoning 4-3 on 2026-05-28. Coordinates are the geocoded street address 13074 Mountain Road, not a surveyed parcel centroid; sources do not describe the workload as AI-specific.",
    sources: [
      {
        url: "https://www.wtvr.com/news/local-news/hanover-county/tract-data-center-vote-may-28-2026",
        title:
          "Hanover Board of Supervisors denies controversial Mountain Road data center development",
        type: "news",
        publishedAt: "2026-05-28",
      },
    ],
  },
  {
    slug: "holder-industrial-park-citrus-county-fl",
    name: "Holder Industrial Park data center site",
    operatorSlug: "deltona-corporation",
    status: "cancelled",
    aiDedicated: false,
    lat: 28.8516,
    lng: -82.4876,
    city: "Lecanto",
    region: "FL",
    country: "US",
    description:
      "Speculative data center rezoning at the Holder Industrial Park near Lecanto; the Citrus County Planning and Development Commission denied the ~800-acre application on 2026-06-18 under a one-year county data center moratorium. No end operator was ever named, so the applicant, the Deltona Corporation, is recorded as operator; coordinates are the Lecanto community centroid, not a parcel.",
    sources: [
      {
        url: "https://capturecascade.org/event/2026-06-18--citrus-county-fl-data-center-moratorium-holder-rezoning-denied/",
        title:
          "Citrus County FL Planning Commission Denies Holder Industrial Park Rezoning After One-Year Data-Center Moratorium",
        type: "other",
        publishedAt: "2026-06-18",
      },
    ],
  },
  {
    slug: "eight-form-el-segundo-ca",
    name: "Eight Form El Segundo (750 N. Nash Street)",
    operatorSlug: "eight-form",
    status: "cancelled",
    aiDedicated: false,
    lat: 33.9262,
    lng: -118.3869,
    city: "El Segundo",
    region: "CA",
    country: "US",
    capacityMwPlanned: 50,
    description:
      "Proposed five-storey, ~230,000 sq ft data center and substation replacing the Hyatt Place hotel at 750 N. Nash Street; Eight Form withdrew the application at the El Segundo Planning Commission hearing on 2026-07-09. Coordinates are the geocoded street address (the existing hotel parcel). The 50MW figure is from secondary reporting and is not stated in the fetched source.",
    sources: [
      {
        url: "https://la.urbanize.city/post/developer-pulls-plug-short-lived-plan-el-segundo-data-center",
        title:
          "Developer pulls the plug on short-lived plan for El Segundo data center",
        type: "news",
        publishedAt: "2026-07",
      },
    ],
  },
  {
    slug: "townsite-solar-2-boulder-city-nv",
    name: "Townsite Solar 2 AI data center (Boulder City)",
    operatorSlug: "townsite-solar-2",
    status: "announced",
    aiDedicated: true,
    lat: 35.9788,
    lng: -114.8338,
    city: "Boulder City",
    region: "NV",
    country: "US",
    description:
      "Proposed AI data center by Townsite Solar 2 LLC (Skylar Capital Management). Boulder City's planning commission recommended denial in May 2026 and the developer withdrew from the city land-management process in July 2026, after BLM approved a right-of-way amendment on 2026-06-26 allowing data center use on an adjacent 80-acre federal parcel; the city council voted to appeal on 2026-07-14. Coordinates are the Boulder City municipal centroid, not the parcel — sources place the federal parcel south of I-11 and west of US-95.",
    sources: [
      {
        url: "https://lasvegassun.com/news/2026/jul/08/developer-drops-boulder-city-data-center-request-a/",
        title:
          "Developer drops Boulder City data center request as BLM approves adjacent federal land use",
        type: "news",
        publishedAt: "2026-07-08",
      },
      {
        url: "https://www.bouldercityreview.com/news/city-to-appeal-blms-data-center-plan-127394/",
        title:
          "Boulder City council to appeal federal approval of AI data center",
        type: "news",
        publishedAt: "2026-07",
      },
    ],
  },
  {
    slug: "lex-developments-pocatello-id",
    name: "Lex Developments Pocatello AI campus (former Hoku site)",
    operatorSlug: "lex-developments",
    status: "cancelled",
    aiDedicated: true,
    lat: 42.862,
    lng: -112.4506,
    city: "Pocatello",
    region: "ID",
    country: "US",
    capacityMwPlanned: 200,
    coolingType: "closed-loop",
    description:
      "Arizona-based Lex Developments proposed a ~$2.3bn AI campus of seven buildings on the former Hoku Materials polysilicon site at 1800 River Park Way; the hearing examiner denied the conditional use permit in May 2026 and the developer appealed on 2026-06-01. BoiseDev reported the city council upheld the denial on 2026-07-20 (that source could not be fetched). Coordinates are the Pocatello city centroid, not the parcel.",
    sources: [
      {
        url: "https://localnews8.com/news/2026/06/04/developers-appeal-pocatellos-denial-of-proposed-ai-data-center/",
        title:
          "Developers appeal Pocatello's denial of proposed AI data center",
        type: "news",
        publishedAt: "2026-06-04",
      },
      {
        url: "https://boisedev.com/news/2026/07/20/city-denies-2-6-billion-data-center-but-developer-vows-to-appeal/",
        title:
          "City denies $2.6 billion data center, but developer vows to appeal",
        type: "news",
        publishedAt: "2026-07-20",
      },
    ],
  },
  {
    slug: "vulcan-core-tyler-tx",
    name: "Vulcan Core West Erwin Street (Tyler)",
    operatorSlug: "vulcan-core",
    status: "cancelled",
    aiDedicated: false,
    lat: 32.3508,
    lng: -95.3125,
    city: "Tyler",
    region: "TX",
    country: "US",
    capacityMwPlanned: 12,
    description:
      "12MW bitcoin-mining data center proposed by Vulcan Core with property owner Barrio Energy at 1101-1105 W. Erwin Street on ~1.8 acres; the Tyler Planning and Zoning Commission denied the special use permit 5-2 on 2026-07-07. Coordinates are the geocoded street address 1105 W. Erwin Street. Workload is bitcoin mining, not AI.",
    sources: [
      {
        url: "https://tylerpaper.com/2026/07/08/tyler-planning-and-zoning-commission-denies-special-use-permit-for-proposed-data-center/",
        title:
          "Tyler Planning and Zoning Commission denies special use permit for proposed data center",
        type: "news",
        publishedAt: "2026-07-08",
      },
    ],
  },
  {
    slug: "douglas-county-i20-ga",
    name: "Douglas County I-20 data center campus",
    operatorSlug: "edgeconnex",
    status: "cancelled",
    aiDedicated: false,
    lat: 33.7262,
    lng: -84.9003,
    city: "Villa Rica",
    region: "GA",
    country: "US",
    description:
      "700-acre, 4.4m sq ft, five-building campus proposed near I-20 and Liberty Road by the Carroll County line; Douglas County commissioners denied the rezoning 4-1 on 2026-07-07, the second refusal on the same property in seven months. The applicant of record is East Village Dothan LLC, reported as a subsidiary of EdgeConneX, which is recorded here as operator because no end user was disclosed. Coordinates are a street-level point on Liberty Road, not the parcel.",
    sources: [
      {
        url: "https://capturecascade.org/event/2026-07-07--douglas-county-ga-blocks-edgeconnex-700-acre-data-center-campus/",
        title:
          "Douglas County GA Votes 4-1 to Block EdgeConneX's 700-Acre Data Center Campus — Second Denial in Seven Months",
        type: "other",
        publishedAt: "2026-07-07",
      },
    ],
  },
  {
    slug: "jefferson-proving-grounds-madison-in",
    name: "Jefferson Proving Ground data center campus",
    operatorSlug: "ford-family-dupont",
    status: "announced",
    aiDedicated: false,
    lat: 38.8619,
    lng: -85.4157,
    city: "Madison",
    region: "IN",
    country: "US",
    description:
      "Nine buildings totalling 7.1m sq ft on 549 acres of the former Jefferson Proving Ground near Madison; an improvement location permit was issued on 2026-02-25 under existing industrial-warehousing zoning and upheld on appeal by the county board of zoning appeals. No developer or end operator has been disclosed, so the landowner-applicant (the Ford family of Dupont, Indiana) is recorded as operator. Coordinates are an approximate point inside the Jefferson County portion of the proving ground, not the 549-acre parcel.",
    sources: [
      {
        url: "https://www.eaglecountryonline.com/news/local-news/jefferson-county-data-center-sparks-community-debate/",
        title: "Jefferson County Data Center Sparks Community Debate",
        type: "news",
      },
    ],
  },
  {
    slug: "ntt-mesa-az",
    name: "NTT Pacific Proving Technology Park (Mesa)",
    operatorSlug: "ntt",
    status: "announced",
    aiDedicated: false,
    lat: 33.2851,
    lng: -111.6187,
    city: "Mesa",
    region: "AZ",
    country: "US",
    capacityMwPlanned: 360,
    description:
      "NTT bought roughly 173 acres at the north-east corner of Pecos and Crismon roads in east Mesa for $300m, on land entitled in 2024 as the Pacific Proving Technology Campus (seven data halls, ~1.7m sq ft, plus warehouse and office). Coordinates are the Pecos/Crismon road intersection, not the parcel centroid; the 360MW figure comes from secondary reporting rather than the fetched source.",
    sources: [
      {
        url: "https://ktar.com/arizona-technology-news/ntt-data-group-buys-land/5687407/",
        title: "NTT Data Group closes on 173 acres of Mesa land",
        type: "news",
      },
    ],
  },
  {
    slug: "homer-city-ai-campus-pa",
    name: "Homer City Energy Campus",
    operatorSlug: "homer-city-redevelopment",
    status: "under-construction",
    aiDedicated: true,
    lat: 40.5108,
    lng: -79.1936,
    city: "Homer City",
    region: "PA",
    country: "US",
    primaryPowerSource: "gas",
    description:
      "More than 3,200 acres on the site of the retired Homer City coal plant in Indiana County, being redeveloped by Homer City Redevelopment with Kiewit into a gas-fired AI/HPC data center campus with about 4.5GW of on-site generation; vertical construction ('first steel') began 2026-04-01. Coordinates are the former generating station, per Wikipedia's published coordinates. The 4.5GW figure is generation capacity, not committed IT load, so no capacity value is recorded. Sources describe the site as Center Township; the task brief also lists Blacklick Township.",
    sources: [
      {
        url: "https://www.fractracker.org/2026/04/homer-city-ai-campus-gas-power-construction/",
        title:
          "From Coal Plant to AI Campus: FracTracker Documents Construction at Homer City",
        type: "other",
        publishedAt: "2026-04",
      },
      {
        url: "https://www.homercityredevelopment.com/",
        title: "Homer City Redevelopment",
        type: "operator",
      },
      {
        url: "https://en.wikipedia.org/wiki/Homer_City_Generating_Station",
        title: "Homer City Generating Station",
        type: "other",
      },
    ],
  },
  {
    slug: "aws-falls-township-pa",
    name: "Amazon Falls Township campus (Keystone Trade Center)",
    operatorSlug: "aws",
    status: "under-construction",
    aiDedicated: true,
    lat: 40.155,
    lng: -74.7469,
    city: "Falls Township",
    region: "PA",
    country: "US",
    description:
      "Amazon digital infrastructure campus of about ten buildings and 2m sq ft inside NorthPoint Development's Keystone Trade Center on the former U.S. Steel Fairless Works site, anchored on Building 6 at 1 Ben Fairless Drive. Township supervisors approved land development in March 2025; Amazon filed an air-quality plan approval application (09-0261A) in April 2026 for 280 gas and 3 diesel generators. Coordinates are the Keystone Trade Center industrial park, not an individual building.",
    sources: [
      {
        url: "https://www.pa.gov/agencies/dep/newsroom/2026-07-13-dep-to-host-community-meeting-on-proposed-air-quality-permit-for-amazon-data-center-bucks-county",
        title:
          "DEP to Host Community Meeting on Proposed Air Quality Permit for Amazon Data Center in Falls Township, Bucks County",
        type: "permit",
        publishedAt: "2026-07-13",
      },
      {
        url: "https://www.fallstwp.com/resources/news/article/?id=10070",
        title: "Amazon to Open Data Center at NorthPoint Development in Falls",
        type: "operator",
      },
      {
        url: "https://keystonenewsroom.com/news/infrastructure/bucks-countys-first-data-center-will-open-soon-what-you-need-to-know/",
        title:
          "Bucks County's first data center will open soon. What you need to know",
        type: "news",
        publishedAt: "2026-06",
      },
    ],
  },
  {
    slug: "aws-energy-way-hamlet-nc",
    name: "AWS Energy Way Tech Campus (Hamlet)",
    operatorSlug: "aws",
    status: "under-construction",
    aiDedicated: true,
    lat: 34.8363,
    lng: -79.7363,
    city: "Hamlet",
    region: "NC",
    country: "US",
    description:
      "AWS campus of about 20 buildings on nearly 800 acres in the Energy Way Industrial Park, announced 2025-06-04 as a $10bn investment; North Carolina DEQ was drafting air permits for Amazon and for Duke Energy temporary generators in mid-2026, with a public hearing on 2026-07-30. Coordinates are the geocoded address 198 Energy Way. Status is recorded as under-construction on the basis of reported mid-2026 groundbreaking; the fetched sources confirm permitting and site works rather than an explicit construction start.",
    sources: [
      {
        url: "https://www.publicradioeast.org/2026-06-29/public-hearing-planned-for-amazon-and-duke-energy-data-center-project-in-richmond-county",
        title:
          "Public hearing planned for Amazon and Duke Energy data center project in Richmond County",
        type: "news",
        publishedAt: "2026-06-29",
      },
      {
        url: "https://www.thepilot.com/news/amazon-to-build-data-center-campus-in-richmond-county/article_7a6e447c-7a02-40c1-aedb-18662ebf1dbd.html",
        title: "Amazon to Build Data Center Campus in Richmond County",
        type: "news",
      },
    ],
  },
  {
    slug: "google-hermantown-mn",
    name: "Google Hermantown (Adolph) campus",
    operatorSlug: "google",
    status: "announced",
    aiDedicated: false,
    lat: 46.7785,
    lng: -92.2647,
    city: "Hermantown",
    region: "MN",
    country: "US",
    description:
      "Google confirmed on 2026-03-03 that it is behind a proposed 1.8m sq ft campus of at least four server buildings on 200-400 acres along Morris Thomas Road in the Adolph area of Hermantown, adjacent to Minnesota Power's Arrowhead substation; Minnesota Power says it will add 300MW of wind and 400MW of storage to serve it, and the electric service agreement was before the state PUC. Coordinates are a street-level point on Morris Thomas Road in Adolph, not a parcel. Sources do not state a committed IT load or describe the workload as AI-specific.",
    sources: [
      {
        url: "https://www.kaxe.org/local-news/2026-03-03/google-proposed-data-center-hermantown-minnesota-power",
        title:
          "Google is behind proposed data center in Hermantown, city announces",
        type: "news",
        publishedAt: "2026-03-03",
      },
    ],
  },
  {
    slug: "cologix-johnstown-oh",
    name: "Cologix Johnstown campus",
    operatorSlug: "cologix",
    status: "announced",
    aiDedicated: true,
    lat: 40.1537,
    lng: -82.6852,
    city: "Johnstown",
    region: "OH",
    country: "US",
    capacityMw: 75,
    capacityMwPlanned: 176,
    description:
      "Cologix's ~150-acre AI-ready campus at Johnstown, drawing 75MW initially with headroom to 176MW from AEP and the Energy Cooperative, and carrying a 15-year 100% property tax abatement from the city; it shared in a $42.3m state sales-tax exemption approved 2026-06-02. Coordinates are the Johnstown town centroid, not a parcel. Cologix's own release places the ~154-acre land purchase in Delaware County while the 2026 state filing places this 150-acre site in Licking County — Johnstown straddles the county line.",
    sources: [
      {
        url: "https://signalcleveland.org/ohio-approves-last-data-center-exemption-before-moratorium/",
        title: "2 Ohio data centers get $42M tax break before pause",
        type: "news",
        publishedAt: "2026-06",
      },
      {
        url: "https://cologix.com/news/cologix-expands-central-ohio-footprint-with-land-acquisition-for-new-ai-ready-800mw-data-center-campus/",
        title:
          "Cologix Expands Central Ohio Footprint With Land Acquisition For New AI-Ready 800MW Data Center Campus",
        type: "pr",
        publishedAt: "2024-11-20",
      },
    ],
  },
  {
    slug: "cologix-delaware-county-oh",
    name: "Cologix Delaware County site",
    operatorSlug: "cologix",
    status: "announced",
    aiDedicated: true,
    lat: 40.2318,
    lng: -82.9651,
    region: "OH",
    country: "US",
    capacityMw: 25,
    capacityMwPlanned: 75,
    description:
      "Cologix data center on a 25-acre Delaware County site, drawing 25MW initially from AEP with headroom to 75MW; part of the $1.17bn central-Ohio programme that received a $42.3m state sales-tax exemption on 2026-06-02, the last approved before Ohio's moratorium. Coordinates are the Delaware County centroid — the fetched source names only the county, not a municipality or parcel.",
    sources: [
      {
        url: "https://signalcleveland.org/ohio-approves-last-data-center-exemption-before-moratorium/",
        title: "2 Ohio data centers get $42M tax break before pause",
        type: "news",
        publishedAt: "2026-06",
      },
      {
        url: "https://cologix.com/news/cologix-expands-central-ohio-footprint-with-land-acquisition-for-new-ai-ready-800mw-data-center-campus/",
        title:
          "Cologix Expands Central Ohio Footprint With Land Acquisition For New AI-Ready 800MW Data Center Campus",
        type: "pr",
        publishedAt: "2024-11-20",
      },
    ],
  },
  {
    slug: "prologis-trenton-oh",
    name: "Prologis Trenton campus (Project Mila)",
    operatorSlug: "prologis",
    status: "announced",
    aiDedicated: false,
    lat: 39.4446,
    lng: -84.4538,
    city: "Trenton",
    region: "OH",
    country: "US",
    capacityMwPlanned: 250,
    description:
      "Four 220,000 sq ft single-storey buildings plus a substation on about 140 acres off Woodsdale Road in the Trenton Industrial Park, drawing up to 250MW; Trenton City Council approved a 15-year, 75% property tax abatement on 2026-07-09 and construction was expected to begin in autumn 2026. Coordinates are a street-level point on Woodsdale Road, not the parcel. Sources do not describe the workload as AI-specific.",
    sources: [
      {
        url: "https://www.wyso.org/2026-07-09/trenton-approves-15-year-tax-abatement-for-data-center",
        title: "Trenton approves 15-year tax abatement for data center",
        type: "news",
        publishedAt: "2026-07-09",
      },
    ],
  },
  {
    slug: "related-the-barn-saline-mi",
    name: "The Barn (Saline Township Stargate campus)",
    operatorSlug: "related-digital",
    status: "under-construction",
    aiDedicated: true,
    lat: 42.1245,
    lng: -83.8386,
    city: "Saline Township",
    region: "MI",
    country: "US",
    capacityMwPlanned: 1000,
    coolingType: "closed-loop",
    description:
      "1GW, ~$16bn Stargate campus on 250 acres in Saline Township, developed by Related Digital with Blackstone and built by Walbridge for Oracle and OpenAI; ground was broken on 2026-06-01 with completion targeted for 2027. Coordinates are the Saline Township centroid, not the 250-acre parcel.",
    sources: [
      {
        url: "https://www.wxyz.com/news/data-centers/oracle-openai-barn-data-center-breaks-ground-in-saline-township-additional-community-investments-announced",
        title:
          "Oracle, OpenAI 'Barn' data center breaks ground in Saline Township, additional community investments announced",
        type: "news",
        publishedAt: "2026-06-01",
      },
      {
        url: "https://www.wilx.com/2026/06/01/oracle-openai-break-ground-barn-data-center-saline-township/",
        title:
          "Oracle, OpenAI break ground on 'The Barn' data center in Saline Township",
        type: "news",
        publishedAt: "2026-06-01",
      },
    ],
  },
  {
    slug: "beale-claremore-ok",
    name: "Beale Infrastructure Claremore campus (Project Mustang)",
    operatorSlug: "beale-infrastructure",
    status: "announced",
    aiDedicated: false,
    lat: 36.3363,
    lng: -95.6146,
    city: "Claremore",
    region: "OK",
    country: "US",
    description:
      "Phased hyperscale campus in the Claremore Industrial Park, north-east of the E. Lowry Road / S. 4150 Road intersection, with tax incentives approved in May 2026, phase 1 construction due to start autumn 2026 and complete autumn 2028; power comes from the City of Claremore as a wholesale customer of the Grand River Dam Authority. Coordinates are the road intersection named by the developer, not the parcel. The fetched operator page does not state a capacity or describe the workload as AI-specific.",
    sources: [
      {
        url: "http://bealeinfra.com/location/claremore/",
        title: "Claremore, OK - Beale Infrastructure",
        type: "operator",
      },
    ],
  },
  {
    slug: "google-van-buren-mi",
    name: "Google Van Buren Township campus (Project Cannoli)",
    operatorSlug: "google",
    status: "announced",
    aiDedicated: false,
    lat: 42.2208,
    lng: -83.4841,
    city: "Van Buren Township",
    region: "MI",
    country: "US",
    capacityMwPlanned: 1000,
    description:
      "1GW campus on 282 acres north of I-94 between Haggerty Road and I-275, developed by Panattoni; the township planning commission granted preliminary site plan approval 5-2 on 2026-02-11/12 and Google was confirmed as the end user on 2026-03-17. DTE Energy filings were pending before the Michigan PSC. Coordinates are the Van Buren Charter Township centroid, not the parcel. Sources do not describe the workload as AI-specific, though OpenAI and Oracle executives have visited the site.",
    sources: [
      {
        url: "https://www.cbsnews.com/detroit/news/google-van-buren-township-data-center-plan/",
        title:
          "Google confirmed as company behind Van Buren Township data center plan",
        type: "news",
        publishedAt: "2026-03",
      },
      {
        url: "https://www.michiganpublic.org/transportation-infrastructure/2026-03-18/google-revealed-as-company-behind-hyperscale-data-center-project-cannoli",
        title:
          "Google revealed as company behind hyperscale data center 'Project Cannoli'",
        type: "news",
        publishedAt: "2026-03-18",
      },
      {
        url: "https://planetdetroit.org/2026/02/project-cannoli-preliminary-site-plan/",
        title:
          "Van Buren Township advances 1 GW 'Project Cannoli' data center: 'It's a big decision'",
        type: "news",
        publishedAt: "2026-02",
      },
      {
        url: "https://www.panattoni.com/vanburen/",
        title: "Project Cannoli, Van Buren Michigan | Panattoni",
        type: "operator",
      },
    ],
  },
  {
    slug: "dynamo-archer-county-tx",
    name: "Dynamo Ventures Archer County site (Project Raptor)",
    operatorSlug: "dynamo-ventures",
    status: "announced",
    aiDedicated: false,
    lat: 33.5817,
    lng: -98.7045,
    region: "TX",
    country: "US",
    description:
      "Data center proposed by Dynamo Ventures LLC in Archer County, reported to be intended to serve Google; the county commissioners court unanimously denied the tax abatement request on 2026-06-22, which does not by itself stop the project. Coordinates are the Archer County centroid — no parcel location is published in the fetched source.",
    sources: [
      {
        url: "https://www.newschannel6now.com/2026/06/22/archer-county-commissioners-deny-tax-abatement-proposed-data-center/",
        title:
          "Archer County Commissioners deny tax abatement for proposed data center",
        type: "news",
        publishedAt: "2026-06-22",
      },
    ],
  },
  {
    slug: "digipower-x-columbiana-al",
    name: "DigiPower X Columbiana",
    operatorSlug: "digipower-x",
    status: "announced",
    aiDedicated: false,
    lat: 33.1828,
    lng: -86.6185,
    city: "Columbiana",
    region: "AL",
    country: "US",
    description:
      "DigiPower X data center at 130 Industrial Parkway; Columbiana City Council unanimously rejected the company's request for a nine-year, 100% city property tax abatement on 2026-05-05, leaving open a revised deal. Coordinates are the geocoded street address. The fetched source states no capacity and does not describe the workload as AI-specific.",
    sources: [
      {
        url: "https://abc3340.com/news/local/columbiana-council-unanimously-rejects-major-tax-break-for-proposed-data-center",
        title:
          "Columbiana Council Unanimously Rejects Major Tax Break for Proposed Data Center",
        type: "news",
        publishedAt: "2026-05-06",
      },
    ],
  },
  {
    slug: "qts-lancium-hall-county-tx",
    name: "QTS Hall County campus (Lancium Clean Campus)",
    operatorSlug: "qts",
    status: "announced",
    aiDedicated: false,
    lat: 34.3939,
    lng: -100.8941,
    city: "Turkey",
    region: "TX",
    country: "US",
    coolingType: "closed-loop",
    description:
      "QTS will design, build and operate up to 11 data center buildings on roughly 465 acres of Lancium's Clean Campus near Turkey in Hall County, announced 2026-07-13 with more than $10bn of stated capital investment and a reported 1GW grid connection; Lancium is adding on-site solar and battery storage and QTS specifies closed-loop cooling. Coordinates are the Turkey town centroid, not the parcel. The QTS release states no megawatt figure and does not describe the workload as AI-specific.",
    sources: [
      {
        url: "https://q.com/news/qts-and-lancium-announce-data-center-campus-in-hall-county-texas/",
        title:
          "QTS and Lancium Announce Data Center Campus in Hall County, Texas",
        type: "pr",
        publishedAt: "2026-07-13",
      },
      {
        url: "https://baxtel.com/news/top-data-center-news-for-13th-18th-july-2026",
        title: "Top Data Center News for 13th-18th July, 2026",
        type: "other",
        publishedAt: "2026-07",
      },
    ],
  },
  {
    slug: "stream-graham-tx",
    name: "Stream Data Centers Graham campus (Project Saltworks)",
    operatorSlug: "stream-data-centers",
    status: "announced",
    aiDedicated: false,
    lat: 33.1064,
    lng: -98.5904,
    city: "Graham",
    region: "TX",
    country: "US",
    description:
      "Proposal for roughly 867-890 acres and about 15 data center buildings south of FM 61 and north of FM 209 in unincorporated Young County, developed by Headwaters Site Development, an affiliate of Stream Data Centers, with a stated $10bn investment; unpermitted and with no end user identified, construction targeted for 2027. Coordinates are the Graham town centroid, not the parcel. Local reporting from The Graham Leader could not be fetched (rate-limited), so acreage and building counts rest on an aggregator summary.",
    sources: [
      {
        url: "https://baxtel.com/news/top-data-center-news-for-13th-18th-july-2026",
        title: "Top Data Center News for 13th-18th July, 2026",
        type: "other",
        publishedAt: "2026-07",
      },
      {
        url: "https://www.grahamleader.com/news/article_ebfabcc7-9f75-43b1-a7f1-23245af474e8.html",
        title:
          "Young County residents address data center developer at Commissioners Court",
        type: "news",
        publishedAt: "2026-06",
      },
      {
        url: "https://www.streamdatacenters.com/",
        title: "Stream Data Centers",
        type: "operator",
      },
    ],
  },
  {
    slug: "greenlight-electricity-centre-sturgeon-county-ab",
    name: "Greenlight Electricity Centre",
    operatorSlug: "greenlight-electricity-centre",
    status: "announced",
    aiDedicated: false,
    lat: 53.8422,
    lng: -113.5407,
    region: "AB",
    country: "CA",
    primaryPowerSource: "gas",
    description:
      "This record is a power plant, not a data center: a 932MW gas combined-cycle facility in Alberta's Industrial Heartland in Sturgeon County, owned by Pembina Pipeline (47.5%), Morgan Stanley Infrastructure Partners (47.5%) and Kineticor (5%), built to supply behind-the-meter power to an adjacent data centre campus. It is entered under the developer partnership because the co-located data centre had no named operator when this stub was created; CBC has since reported the neighbouring campus as Meta's. The 932MW is generation capacity, not data centre IT load, so no capacity value is recorded. Coordinates are the Sturgeon County centroid, not the plant site.",
    sources: [
      {
        url: "https://greenlightelectricitycentre.ca/",
        title: "Greenlight Electricity Centre",
        type: "operator",
      },
    ],
  },
  {
    slug: "circe-energy-west-texas-tx",
    name: "Circe Energy West Texas AI Infrastructure Campus",
    operatorSlug: "circe-energy",
    status: "announced",
    aiDedicated: true,
    lat: 31.9974,
    lng: -102.0779,
    region: "TX",
    country: "US",
    primaryPowerSource: "gas",
    description:
      "1,950-acre AI/HPC campus in the Permian Basin run as a behind-the-meter prime-power microgrid, with about 2GW of Cummins gas gensets ordered for delivery 2026-2030 and phased energisation from 2027. The exact site has never been disclosed publicly, so the coordinates are a regional placeholder at Midland, Texas and should not be read as a site location; the record describes a development platform rather than a built data center, and the 2GW figure is generation capacity rather than committed IT load.",
    sources: [
      {
        url: "https://www.prnewswire.com/news-releases/circe-energy-advances-scalable-behind-the-meter-ai-infrastructure-platform-with-2-gw-of-generation-capacity-302802334.html",
        title:
          "CIRCE ENERGY ADVANCES SCALABLE BEHIND-THE-METER AI INFRASTRUCTURE PLATFORM WITH 2 GW OF GENERATION CAPACITY",
        type: "pr",
        publishedAt: "2026-06-16",
      },
    ],
  },
];

export const REFRESH_2026_07_BRANDS: SeedBrand[] = [
  {
    slug: "core-scientific",
    canonicalName: "Core Scientific, Inc.",
    website: "https://www.corescientific.com",
  },
  {
    slug: "fluidstack",
    canonicalName: "Fluidstack",
    website: "https://www.fluidstack.io",
  },
  {
    slug: "mara",
    canonicalName: "MARA Holdings, Inc.",
    website: "https://www.mara.com",
  },
  {
    slug: "hive-digital",
    canonicalName: "HIVE Digital Technologies Ltd.",
    website: "https://www.hivedigitaltech.com",
  },
  {
    slug: "digi-power-x",
    canonicalName: "Digi Power X Inc.",
    website: "https://www.digipowerx.com",
  },
  {
    slug: "nscale",
    canonicalName: "Nscale",
    website: "https://nscale.com",
  },
  {
    slug: "airtrunk",
    canonicalName: "AirTrunk Operating Pty Ltd",
  },
  {
    slug: "global-telecommunications-group",
    canonicalName: "Global Telecommunications Group",
  },
  {
    slug: "firmus",
    canonicalName: "Firmus Technologies",
    website: "https://firmus.co",
  },
  {
    slug: "dayone",
    canonicalName: "DayOne Data Centers",
  },
  {
    slug: "true-idc",
    canonicalName: "True Internet Data Center",
  },
  {
    slug: "toyota-tsusho",
    canonicalName: "Toyota Tsusho Corporation",
    website: "https://www.toyota-tsusho.com",
  },
  {
    slug: "eurus-energy",
    canonicalName: "Eurus Energy Holdings Corporation",
    website: "https://www.eurus-energy.com",
  },
  {
    slug: "itc-properties",
    canonicalName: "ITC Properties Group Limited",
  },
  {
    slug: "neoai-cloud",
    canonicalName: "NeoAI Cloud",
  },
  {
    slug: "gs-group",
    canonicalName: "GS Group",
  },
  {
    slug: "goodman-group",
    canonicalName: "Goodman Group",
  },
  {
    slug: "digital-edge",
    canonicalName: "Digital Edge DC",
  },
  {
    slug: "telangana-government",
    canonicalName: "Government of Telangana",
  },
  {
    slug: "g-group",
    canonicalName: "G-Group Technology Corporation",
  },
  {
    slug: "letsia",
    canonicalName: "Letsia",
  },
  {
    slug: "hassan-allam-digital",
    canonicalName: "Hassan Allam Digital",
  },
  {
    slug: "income-igi",
    canonicalName: "Income (IGI Group)",
  },
  {
    slug: "raxio",
    canonicalName: "Raxio Group",
  },
  {
    slug: "cybastion",
    canonicalName: "Cybastion Institute of Technology",
  },
  {
    slug: "kasi-cloud",
    canonicalName: "Kasi Cloud Datacenters",
  },
  {
    slug: "bytedance",
    canonicalName: "ByteDance Ltd.",
  },
  {
    slug: "omnia",
    canonicalName: "Omnia",
  },
  {
    slug: "ada-infrastructure",
    canonicalName: "Ada Infrastructure",
  },
  {
    slug: "elea-data-centers",
    canonicalName: "Elea Data Centers",
    website: "https://eleadatacenters.com",
  },
  {
    slug: "alto-infrastructure",
    canonicalName: "Alto Infrastructure",
    website: "https://altoinfrastructure.com",
  },
  {
    slug: "amptank",
    canonicalName: "AmpTank AG",
  },
  {
    slug: "arcem",
    canonicalName: "Arcem",
  },
  {
    slug: "bulk-infrastructure",
    canonicalName: "Bulk Infrastructure Group AS",
    website: "https://bulkinfrastructure.com",
  },
  {
    slug: "corscale",
    canonicalName: "Corscale",
  },
  {
    slug: "edgeconnex",
    canonicalName: "EdgeConneX",
  },
  {
    slug: "era4",
    canonicalName: "Era4",
    website: "https://era4.com",
  },
  {
    slug: "hscale",
    canonicalName: "hscale",
    website: "https://www.hscaledc.com",
  },
  {
    slug: "k2-strategic",
    canonicalName: "K2 Strategic",
  },
  {
    slug: "kao-data",
    canonicalName: "Kao Data",
    website: "https://kaodata.com",
  },
  {
    slug: "pure-dc",
    canonicalName: "Pure Data Centres Group",
    website: "https://puredc.com",
  },
  {
    slug: "red-admiral-dc",
    canonicalName: "Red Admiral DC Ltd",
  },
  {
    slug: "start-campus",
    canonicalName: "Start Campus",
  },
  {
    slug: "techbau",
    canonicalName: "Techbau",
  },
  {
    slug: "twenty20-energy",
    canonicalName: "Twenty20 Energy",
  },
  {
    slug: "openai",
    canonicalName: "OpenAI",
    website: "https://openai.com",
  },
  {
    slug: "prime-data-centers",
    canonicalName: "Prime Data Centers",
    website: "https://primedatacenters.com",
  },
  {
    slug: "buzz-hpc",
    canonicalName: "BUZZ HPC",
  },
  {
    slug: "deltona-corporation",
    canonicalName: "The Deltona Corporation",
  },
  {
    slug: "eight-form",
    canonicalName: "Eight Form",
  },
  {
    slug: "townsite-solar-2",
    canonicalName: "Townsite Solar 2, LLC",
  },
  {
    slug: "lex-developments",
    canonicalName: "Lex Developments",
  },
  {
    slug: "vulcan-core",
    canonicalName: "Vulcan Core",
  },
  {
    slug: "ford-family-dupont",
    canonicalName: "Ford Family (Dupont, Indiana)",
  },
  {
    slug: "homer-city-redevelopment",
    canonicalName: "Homer City Redevelopment",
    website: "https://www.homercityredevelopment.com/",
  },
  {
    slug: "prologis",
    canonicalName: "Prologis",
  },
  {
    slug: "related-digital",
    canonicalName: "Related Digital",
  },
  {
    slug: "beale-infrastructure",
    canonicalName: "Beale Infrastructure",
  },
  {
    slug: "dynamo-ventures",
    canonicalName: "Dynamo Ventures LLC",
  },
  {
    slug: "digipower-x",
    canonicalName: "DigiPower X",
  },
  {
    slug: "stream-data-centers",
    canonicalName: "Stream Data Centers",
    website: "https://www.streamdatacenters.com/",
  },
  {
    slug: "greenlight-electricity-centre",
    canonicalName: "Greenlight Electricity Centre Limited Partnership",
    website: "https://greenlightelectricitycentre.ca/",
  },
  {
    slug: "circe-energy",
    canonicalName: "Circe Energy",
  },
  {
    slug: "mgx",
    canonicalName: "MGX",
    website: "https://www.mgx.ae",
  },
  {
    slug: "global-infrastructure-partners",
    canonicalName: "Global Infrastructure Partners",
    website: "https://www.global-infra.com",
  },
  {
    slug: "macquarie-asset-management",
    canonicalName: "Macquarie Asset Management",
  },
  {
    slug: "columbia-capital",
    canonicalName: "Columbia Capital",
  },
  {
    slug: "ingenostrum",
    canonicalName: "Ingenostrum, S.L.",
  },
  {
    slug: "arcus-infrastructure-partners",
    canonicalName: "Arcus Infrastructure Partners",
  },
  {
    slug: "volta-data-centres",
    canonicalName: "Volta Data Centres",
  },
  {
    slug: "stark-power",
    canonicalName: "Stark Power Ltd.",
  },
  {
    slug: "sagebrush-infrastructure-partners",
    canonicalName: "Sagebrush Infrastructure Partners, LLC",
  },
  {
    slug: "abernathy-joint-venture",
    canonicalName: "Abernathy Joint Venture",
  },
  {
    slug: "soluna",
    canonicalName: "Soluna Holdings, Inc.",
    website: "https://www.solunacomputing.com",
  },
  {
    slug: "project-dorothy-1b",
    canonicalName: "Project Dorothy 1B",
  },
  {
    slug: "navitas-global",
    canonicalName: "Navitas Global",
  },
  {
    slug: "nextera-energy",
    canonicalName: "NextEra Energy, Inc.",
  },
  {
    slug: "swi-group",
    canonicalName: "SWI Stoneweg Icona Group",
    website: "https://www.swi.com",
  },
  {
    slug: "genesis-digital-assets",
    canonicalName: "Genesis Digital Assets Limited",
  },
  {
    slug: "polarise",
    canonicalName: "Polarise GmbH",
    website: "https://www.polarise.eu",
  },
  {
    slug: "aionx",
    canonicalName: "AiOnX",
  },
  {
    slug: "apleona",
    canonicalName: "Apleona",
    website: "https://apleona.com",
  },
  {
    slug: "sygna",
    canonicalName: "Sygna",
  },
  {
    slug: "i-squared-capital",
    canonicalName: "I Squared Capital",
    website: "https://isquaredcapital.com",
  },
  {
    slug: "piemonte-holding",
    canonicalName: "Piemonte Holding",
  },
  {
    slug: "jacobs",
    canonicalName: "Jacobs",
    website: "https://www.jacobs.com",
  },
  {
    slug: "aecon",
    canonicalName: "Aecon Group Inc.",
    website: "https://www.aecon.com",
  },
  {
    slug: "tecnicas-reunidas",
    canonicalName: "Tecnicas Reunidas Alberta, Inc.",
  },
  {
    slug: "cummins",
    canonicalName: "Cummins Inc.",
    website: "https://www.cummins.com",
  },
];

export const REFRESH_2026_07_NEW_BRANDS: NewBrandSeed[] = [
  {
    slug: "core-scientific",
    canonicalName: "Core Scientific, Inc.",
    website: "https://www.corescientific.com",
  },
  {
    slug: "fluidstack",
    canonicalName: "Fluidstack",
    website: "https://www.fluidstack.io",
  },
  {
    slug: "mara",
    canonicalName: "MARA Holdings, Inc.",
    website: "https://www.mara.com",
  },
  {
    slug: "hive-digital",
    canonicalName: "HIVE Digital Technologies Ltd.",
    website: "https://www.hivedigitaltech.com",
  },
  {
    slug: "digi-power-x",
    canonicalName: "Digi Power X Inc.",
    website: "https://www.digipowerx.com",
  },
  {
    slug: "nscale",
    canonicalName: "Nscale",
    website: "https://nscale.com",
  },
  {
    slug: "airtrunk",
    canonicalName: "AirTrunk Operating Pty Ltd",
  },
  {
    slug: "global-telecommunications-group",
    canonicalName: "Global Telecommunications Group",
  },
  {
    slug: "firmus",
    canonicalName: "Firmus Technologies",
    website: "https://firmus.co",
  },
  {
    slug: "dayone",
    canonicalName: "DayOne Data Centers",
  },
  {
    slug: "true-idc",
    canonicalName: "True Internet Data Center",
  },
  {
    slug: "toyota-tsusho",
    canonicalName: "Toyota Tsusho Corporation",
    website: "https://www.toyota-tsusho.com",
  },
  {
    slug: "eurus-energy",
    canonicalName: "Eurus Energy Holdings Corporation",
    website: "https://www.eurus-energy.com",
  },
  {
    slug: "itc-properties",
    canonicalName: "ITC Properties Group Limited",
  },
  {
    slug: "neoai-cloud",
    canonicalName: "NeoAI Cloud",
  },
  {
    slug: "gs-group",
    canonicalName: "GS Group",
  },
  {
    slug: "goodman-group",
    canonicalName: "Goodman Group",
  },
  {
    slug: "digital-edge",
    canonicalName: "Digital Edge DC",
  },
  {
    slug: "telangana-government",
    canonicalName: "Government of Telangana",
  },
  {
    slug: "g-group",
    canonicalName: "G-Group Technology Corporation",
  },
  {
    slug: "letsia",
    canonicalName: "Letsia",
  },
  {
    slug: "hassan-allam-digital",
    canonicalName: "Hassan Allam Digital",
  },
  {
    slug: "income-igi",
    canonicalName: "Income (IGI Group)",
  },
  {
    slug: "raxio",
    canonicalName: "Raxio Group",
  },
  {
    slug: "cybastion",
    canonicalName: "Cybastion Institute of Technology",
  },
  {
    slug: "kasi-cloud",
    canonicalName: "Kasi Cloud Datacenters",
  },
  {
    slug: "bytedance",
    canonicalName: "ByteDance Ltd.",
  },
  {
    slug: "omnia",
    canonicalName: "Omnia",
  },
  {
    slug: "ada-infrastructure",
    canonicalName: "Ada Infrastructure",
  },
  {
    slug: "elea-data-centers",
    canonicalName: "Elea Data Centers",
    website: "https://eleadatacenters.com",
  },
  {
    slug: "alto-infrastructure",
    canonicalName: "Alto Infrastructure",
    website: "https://altoinfrastructure.com",
  },
  {
    slug: "amptank",
    canonicalName: "AmpTank AG",
  },
  {
    slug: "arcem",
    canonicalName: "Arcem",
  },
  {
    slug: "bulk-infrastructure",
    canonicalName: "Bulk Infrastructure Group AS",
    website: "https://bulkinfrastructure.com",
  },
  {
    slug: "corscale",
    canonicalName: "Corscale",
  },
  {
    slug: "edgeconnex",
    canonicalName: "EdgeConneX",
  },
  {
    slug: "era4",
    canonicalName: "Era4",
    website: "https://era4.com",
  },
  {
    slug: "hscale",
    canonicalName: "hscale",
    website: "https://www.hscaledc.com",
  },
  {
    slug: "k2-strategic",
    canonicalName: "K2 Strategic",
  },
  {
    slug: "kao-data",
    canonicalName: "Kao Data",
    website: "https://kaodata.com",
  },
  {
    slug: "pure-dc",
    canonicalName: "Pure Data Centres Group",
    website: "https://puredc.com",
  },
  {
    slug: "red-admiral-dc",
    canonicalName: "Red Admiral DC Ltd",
  },
  {
    slug: "start-campus",
    canonicalName: "Start Campus",
  },
  {
    slug: "techbau",
    canonicalName: "Techbau",
  },
  {
    slug: "twenty20-energy",
    canonicalName: "Twenty20 Energy",
  },
  {
    slug: "openai",
    canonicalName: "OpenAI",
    website: "https://openai.com",
  },
  {
    slug: "prime-data-centers",
    canonicalName: "Prime Data Centers",
    website: "https://primedatacenters.com",
  },
  {
    slug: "buzz-hpc",
    canonicalName: "BUZZ HPC",
  },
  {
    slug: "deltona-corporation",
    canonicalName: "The Deltona Corporation",
  },
  {
    slug: "eight-form",
    canonicalName: "Eight Form",
  },
  {
    slug: "townsite-solar-2",
    canonicalName: "Townsite Solar 2, LLC",
  },
  {
    slug: "lex-developments",
    canonicalName: "Lex Developments",
  },
  {
    slug: "vulcan-core",
    canonicalName: "Vulcan Core",
  },
  {
    slug: "ford-family-dupont",
    canonicalName: "Ford Family (Dupont, Indiana)",
  },
  {
    slug: "homer-city-redevelopment",
    canonicalName: "Homer City Redevelopment",
    website: "https://www.homercityredevelopment.com/",
  },
  {
    slug: "prologis",
    canonicalName: "Prologis",
  },
  {
    slug: "related-digital",
    canonicalName: "Related Digital",
  },
  {
    slug: "beale-infrastructure",
    canonicalName: "Beale Infrastructure",
  },
  {
    slug: "dynamo-ventures",
    canonicalName: "Dynamo Ventures LLC",
  },
  {
    slug: "digipower-x",
    canonicalName: "DigiPower X",
  },
  {
    slug: "stream-data-centers",
    canonicalName: "Stream Data Centers",
    website: "https://www.streamdatacenters.com/",
  },
  {
    slug: "greenlight-electricity-centre",
    canonicalName: "Greenlight Electricity Centre Limited Partnership",
    website: "https://greenlightelectricitycentre.ca/",
  },
  {
    slug: "circe-energy",
    canonicalName: "Circe Energy",
  },
  {
    slug: "mgx",
    canonicalName: "MGX",
    entityType: "corporation",
    jurisdiction: "AE",
    jurisdictionRegion: "Abu Dhabi",
    website: "https://www.mgx.ae",
  },
  {
    slug: "global-infrastructure-partners",
    canonicalName: "Global Infrastructure Partners",
    website: "https://www.global-infra.com",
  },
  {
    slug: "macquarie-asset-management",
    canonicalName: "Macquarie Asset Management",
  },
  {
    slug: "columbia-capital",
    canonicalName: "Columbia Capital",
  },
  {
    slug: "ingenostrum",
    canonicalName: "Ingenostrum, S.L.",
    entityType: "llc",
    jurisdiction: "ES",
  },
  {
    slug: "arcus-infrastructure-partners",
    canonicalName: "Arcus Infrastructure Partners",
  },
  {
    slug: "volta-data-centres",
    canonicalName: "Volta Data Centres",
  },
  {
    slug: "stark-power",
    canonicalName: "Stark Power Ltd.",
    entityType: "public",
    jurisdiction: "IL",
  },
  {
    slug: "sagebrush-infrastructure-partners",
    canonicalName: "Sagebrush Infrastructure Partners, LLC",
    entityType: "llc",
    jurisdiction: "US",
  },
  {
    slug: "abernathy-joint-venture",
    canonicalName: "Abernathy Joint Venture",
    entityType: "joint-venture",
    jurisdiction: "US",
    jurisdictionRegion: "TX",
  },
  {
    slug: "soluna",
    canonicalName: "Soluna Holdings, Inc.",
    entityType: "public",
    jurisdiction: "US",
    website: "https://www.solunacomputing.com",
  },
  {
    slug: "project-dorothy-1b",
    canonicalName: "Project Dorothy 1B",
    jurisdiction: "US",
    jurisdictionRegion: "TX",
  },
  {
    slug: "navitas-global",
    canonicalName: "Navitas Global",
  },
  {
    slug: "nextera-energy",
    canonicalName: "NextEra Energy, Inc.",
    entityType: "public",
    jurisdiction: "US",
  },
  {
    slug: "swi-group",
    canonicalName: "SWI Stoneweg Icona Group",
    entityType: "public",
    website: "https://www.swi.com",
  },
  {
    slug: "genesis-digital-assets",
    canonicalName: "Genesis Digital Assets Limited",
  },
  {
    slug: "polarise",
    canonicalName: "Polarise GmbH",
    entityType: "llc",
    jurisdiction: "DE",
    website: "https://www.polarise.eu",
  },
  {
    slug: "aionx",
    canonicalName: "AiOnX",
  },
  {
    slug: "apleona",
    canonicalName: "Apleona",
    website: "https://apleona.com",
  },
  {
    slug: "sygna",
    canonicalName: "Sygna",
  },
  {
    slug: "i-squared-capital",
    canonicalName: "I Squared Capital",
    website: "https://isquaredcapital.com",
  },
  {
    slug: "piemonte-holding",
    canonicalName: "Piemonte Holding",
    entityType: "holding",
  },
  {
    slug: "jacobs",
    canonicalName: "Jacobs",
    entityType: "public",
    jurisdiction: "US",
    website: "https://www.jacobs.com",
  },
  {
    slug: "aecon",
    canonicalName: "Aecon Group Inc.",
    entityType: "public",
    jurisdiction: "CA",
    website: "https://www.aecon.com",
  },
  {
    slug: "tecnicas-reunidas",
    canonicalName: "Tecnicas Reunidas Alberta, Inc.",
    jurisdiction: "CA",
    jurisdictionRegion: "AB",
  },
  {
    slug: "cummins",
    canonicalName: "Cummins Inc.",
    entityType: "public",
    jurisdiction: "US",
    website: "https://www.cummins.com",
  },
];

export const REFRESH_2026_07_PERMITS: SeedPermit[] = [
  {
    datacenterSlug: "oracle-project-jupiter-dona-ana-nm",
    kind: "other",
    issuingBody:
      "New Mexico State Land Office (Commissioner of Public Lands Stephanie Garcia Richard)",
    issuedDate: "2026-07-14",
    status: "denied",
    sources: [
      {
        url: "https://www.kob.com/news/top-news/new-mexico-land-commissioner-denies-project-jupiter-pipeline-request/",
        title:
          "New Mexico land commissioner denies Project Jupiter pipeline request",
        type: "news",
        publishedAt: "2026-07-16",
      },
      {
        url: "https://sourcenm.com/2026/07/16/new-mexico-land-commissioner-blocks-project-jupiter-related-pipeline-from-building-on-state-land/",
        title:
          "New Mexico land commissioner blocks Project Jupiter-related pipeline from building on state land",
        type: "news",
        publishedAt: "2026-07-16",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/new-mexico-regulators-reject-natural-gas-pipeline-for-oracles-25gw-project-jupiter-data-center/",
        title:
          "New Mexico regulators reject natural gas pipeline for Oracle's 2.5GW Project Jupiter data center",
        type: "news",
      },
    ],
    notes:
      "issuedDate here is the DECISION date, not an issuance. Land Commissioner denied Energy Transfer's two rights-of-way and one business lease to cross ~0.6 miles of state trust land with a 17-mile gas pipeline extension (the 'Green Chile Project') feeding Oracle's Project Jupiter campus in Dona Ana County. This was a denial on reconsideration; the same request was first denied in March 2026 (outside window). Reasons given: high greenhouse-gas emissions, large-scale water use, and little benefit to State Land Office beneficiaries. Reported project scale: ~2.5GW of on-site Bloom fuel cells, 1,400-acre campus, four buildings, hosting AI infrastructure for OpenAI; pipeline sized at up to 400 MMcf/day. Oracle says the project remains on schedule. Primary NM State Land Office document not reached; DCD fetch was 403-blocked, sourcenm fetch was 403-blocked, KOB fetch succeeded.",
  },
  {
    datacenterSlug: "tract-hanover-mountain-road-va",
    kind: "zoning",
    issuingBody: "Hanover County (Virginia) Board of Supervisors",
    appliedDate: "2025",
    issuedDate: "2026-05-27",
    status: "denied",
    sources: [
      {
        url: "https://www.zonewire.co/blog/hanover-county-data-center-rezoning-case-study",
        title:
          "Approved by the Planners, Denied by the Board: A 427-Acre Data Center in Hanover County",
        type: "other",
      },
      {
        url: "https://dcmap.us/insights/policy/",
        title:
          "US Data Center Policy Tracker: Moratoriums, Rejections & Legislation",
        type: "other",
      },
    ],
    notes:
      "issuedDate is the DECISION (denial) date. Case REZ 2025-00023, A-1 Agricultural to M-1 Limited Industrial, 427 acres (reported elsewhere as ~430) at 13074 Mountain Road / 12517 Winns Church Road. Applicant: Tract (Denver) with Marchetti Properties, entity Valco Hanover County 4 LLC; project name Mountain Road Technology Park. Planning Commission had recommended approval 6-1 on 2026-04-16; Board of Supervisors denied 4-3 (Prichard, Floyd, Davis, Stoneman for denial). Deciding factor cited: projected water demand of 600,000-2,000,000 gallons/day. Date conflict: dcmap.us lists 2026-05-28; zonewire and contemporaneous Richmond reporting give the vote as Wednesday 2026-05-27. Using 2026-05-27.",
  },
  {
    datacenterSlug: "tract-hanover-mountain-road-va",
    kind: "grid-interconnect",
    issuingBody: "Hanover County (Virginia) Board of Supervisors",
    appliedDate: "2025",
    issuedDate: "2026-05-27",
    status: "denied",
    sources: [
      {
        url: "https://www.zonewire.co/blog/hanover-county-data-center-rezoning-case-study",
        title:
          "Approved by the Planners, Denied by the Board: A 427-Acre Data Center in Hanover County",
        type: "other",
      },
    ],
    notes:
      "issuedDate is the DECISION (denial) date. Conditional Use Permit CUP 2025-00016 for up to three electrical substations serving the Mountain Road Technology Park campus. Denied on the same 4-3 vote as the rezoning. A companion Special Exception (SE 2025-00023) for 62-foot building heights and increased fence heights was denied in the same motion; not recorded separately here.",
  },
  {
    datacenterSlug: "holder-industrial-park-citrus-county-fl",
    kind: "zoning",
    issuingBody: "Citrus County (Florida) Planning and Development Commission",
    issuedDate: "2026-06-18",
    status: "denied",
    sources: [
      {
        url: "https://baynews9.com/fl/tampa/news/2026/06/18/citrus-county-planning-and-development-commission-vote-down-on-holder-industrial-park-plan",
        title:
          "Citrus County panel rejects Holder Industrial Park data center rezoning",
        type: "news",
        publishedAt: "2026-06-18",
      },
    ],
    notes:
      "issuedDate is the DECISION (denial) date. Applicant: Deltona Corporation. Request would have rezoned to heavy industrial and expanded Holder Industrial Park (Lecanto, FL) from about 557 acres to a little over 1,300 acres, converting nearly 800 acres of agricultural and residential land, to enable a data center. Vote tally not reported. No named data center operator; slug is a site-level placeholder.",
  },
  {
    datacenterSlug: "eight-form-el-segundo-ca",
    kind: "zoning",
    issuingBody: "El Segundo (California) Planning Commission",
    issuedDate: "2026-07-09",
    status: "withdrawn",
    sources: [
      {
        url: "https://la.urbanize.city/post/developer-pulls-plug-short-lived-plan-el-segundo-data-center",
        title:
          "Developer pulls the plug on short-lived plan for El Segundo data center",
        type: "news",
        publishedAt: "2026-07-20",
      },
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-july-20-2026/",
        title: "Data Centers: Daily Notes | July 20, 2026",
        type: "other",
        publishedAt: "2026-07-20",
      },
      {
        url: "https://thepridela.com/2026/07/developer-drops-el-segundo-data-center-plan-after-power-consumption-backlash/",
        title:
          "Developer drops El Segundo data center plan after power consumption backlash",
        type: "news",
      },
    ],
    notes:
      "issuedDate is the date the applicant withdrew, on the record, at the end of a three-hour Planning Commission hearing. Applicant: Eight Form. Proposal: demolish the Hyatt Place hotel at 750 N. Nash Street and build a five-story, ~230,000-230,780 sq ft data center about 160 feet tall with a dedicated substation. Capacity reported as 50MW by DCD; Urbanize LA did not give a MW figure. Withdrawn after sustained resident opposition on noise, water and electricity use. thepridela.com fetch was 403-blocked.",
  },
  {
    datacenterSlug: "townsite-solar-2-boulder-city-nv",
    kind: "zoning",
    issuingBody: "Boulder City (Nevada) Planning Commission",
    issuedDate: "2026-05-20",
    status: "denied",
    sources: [
      {
        url: "https://www.fox5vegas.com/2026/05/21/boulder-city-commission-vote-denies-data-center-application-after-public-pushback/",
        title:
          "Boulder City commission vote denies data center application after public pushback",
        type: "news",
        publishedAt: "2026-05-21",
      },
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-may-21-2026/",
        title: "Data Centers: Daily Notes | May 21, 2026",
        type: "other",
        publishedAt: "2026-05-21",
      },
    ],
    notes:
      "issuedDate is the DECISION (denial) date, at a Wednesday evening meeting. Application for an AI data center tied to the Townsite Solar 2 project. Fox5 headline says 'unanimous' but its body text says the vote was not unanimous; no tally published. Commission chair Lorene Krumm: 'This town is not ready.' Residents objected to waste heat being carried into town by prevailing winds. See the paired federal record below: the developer subsequently moved the project onto BLM land.",
  },
  {
    datacenterSlug: "townsite-solar-2-boulder-city-nv",
    kind: "other",
    issuingBody: "US Bureau of Land Management, Las Vegas Field Office",
    issuedDate: "2026-06-26",
    status: "granted",
    sources: [
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-july-8-2026/",
        title: "Data Centers: Daily Notes | July 8, 2026",
        type: "other",
        publishedAt: "2026-07-08",
      },
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-july-20-2026/",
        title: "Data Centers: Daily Notes | July 20, 2026",
        type: "other",
        publishedAt: "2026-07-20",
      },
    ],
    notes:
      "After the Boulder City Planning Commission denial, the developer withdrew its city application and moved the ~88.5-acre project onto adjacent federal land. BLM approved an AMENDMENT to the existing 2023 Townsite Solar right-of-way grant covering an 80-acre federal parcel, relying on the earlier solar environmental review rather than a new one (BLM Field Manager Bruce Sillitoe). An appeal and a request for a construction stay were subsequently filed. UNVERIFIED AGAINST A PRIMARY BLM DOCUMENT: both sources are the same secondary aggregator, which cites Las Vegas Review-Journal and nevadacurrent.com; I could not reach a BLM case file or the LVRJ article. Treat the 2026-06-26 date as reported, not confirmed.",
  },
  {
    datacenterSlug: "lex-developments-pocatello-id",
    kind: "zoning",
    issuingBody: "City of Pocatello (Idaho) Hearing Examiner (Kathleen Lewis)",
    issuedDate: "2026-05-14",
    status: "denied",
    sources: [
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-may-19-2026/",
        title: "Data Centers: Daily Notes | May 19, 2026",
        type: "other",
        publishedAt: "2026-05-19",
      },
      {
        url: "https://www.idahostatejournal.com/news/local/pocatello-hearing-examiner-denies-hoku-site-data-center-permit-but-lex-developments-vows-return/article_c80a0e12-3fe8-4ed0-b755-89321377a95d.html",
        title:
          "Pocatello hearing examiner denies Hoku site data center permit, but Lex Developments vows return",
        type: "news",
      },
    ],
    notes:
      "issuedDate is the DECISION (denial) date. Conditional Use Permit for an AI data center on the former Hoku Materials polysilicon plant site; applicant Lex Developments (Gilbert, AZ). Denied for failing the seven-part test in Pocatello Municipal Code 17.02.130 D, specifically insufficient detail on water usage and building design. City planning staff had recommended approval. Applicant has said it will reapply. Idaho State Journal fetch returned HTTP 451 (geo-blocked); the denial detail rests on the secondary aggregator.",
  },
  {
    datacenterSlug: "vulcan-core-tyler-tx",
    kind: "zoning",
    issuingBody: "City of Tyler (Texas) Planning and Zoning Commission",
    issuedDate: "2026-07-07",
    status: "denied",
    sources: [
      {
        url: "https://www.kltv.com/2026/07/07/tyler-planning-commission-denies-permit-proposed-data-center/",
        title:
          "Tyler planning commission denies permit for proposed data center",
        type: "news",
        publishedAt: "2026-07-07",
      },
    ],
    notes:
      "issuedDate is the DECISION (denial) date. Special use permit for a facility on W. Erwin Street near downtown Tyler; applicant Vulcan Core, with Barrio named as the eventual lessee. Denied 5-2 (Williams, Davis, Carmichael, Humber, Hudson for denial; Wynne and Martinez against). City planning staff had also recommended denial. Residents raised water use, noise and inadequate notice. The commission is a recommending body; Vulcan Core can appeal to Tyler City Council. CAPACITY NOT RECORDED: the source's stated '12,500 MW' figure for this bitcoin-mining facility is not credible at that site and I have not been able to corroborate it, so no MW value is carried here.",
  },
  {
    datacenterSlug: "douglas-county-i20-ga",
    kind: "zoning",
    issuingBody: "Douglas County (Georgia) Board of Commissioners",
    issuedDate: "2026-07-08",
    status: "denied",
    sources: [
      {
        url: "https://www.yahoo.com/news/us/articles/permit-denied-data-center-proposed-154411096.html",
        title:
          "Permit denied for new data center proposed near I-20 in Douglas County",
        type: "news",
        publishedAt: "2026-07-08",
      },
      {
        url: "https://www.wsbtv.com/news/local/permit-new-proposed-data-center-denied-douglas-county/7FYNFGPB3NG4TDIUAZYP54YO3Q/",
        title: "Permit denied for new proposed data center in Douglas County",
        type: "news",
        publishedAt: "2026-07-08",
      },
    ],
    notes:
      "issuedDate is the DECISION (denial) date. Commissioners denied the permit 4-1 for a proposed data center near the Carroll County line off Interstate 20. Applicant/developer not named in the coverage and project size not disclosed, so the slug is a site-level placeholder. WSB-TV original fetch returned HTTP 451 (geo-blocked); the syndicated Yahoo copy fetched successfully.",
  },
  {
    datacenterSlug: "jefferson-proving-grounds-madison-in",
    kind: "zoning",
    issuingBody: "Jefferson County (Indiana) Board of Zoning Appeals",
    issuedDate: "2026-05-20",
    status: "granted",
    sources: [
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-may-21-2026/",
        title: "Data Centers: Daily Notes | May 21, 2026",
        type: "other",
        publishedAt: "2026-05-21",
      },
    ],
    notes:
      "The Board of Zoning Appeals voted, after a 5.5-hour hearing, to UPHOLD the zoning administrator's determination that the heavy-industrial classification permits a data center on the former Jefferson Proving Grounds site near Madison, Indiana - i.e. the project may proceed without a rezoning. Reported scale: 7.1 million sq ft on 549 acres; land in Ford family ownership; end operator not named. Proponents claim ~$60m/year in tax revenue. Single secondary source (aggregator citing WHAS11); vote tally not reported.",
  },
  {
    datacenterSlug: "ntt-mesa-az",
    kind: "zoning",
    issuingBody:
      "City of Mesa (Arizona) Planning and Zoning Board / Mesa City Council",
    status: "pending",
    sources: [
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-may-21-2026/",
        title: "Data Centers: Daily Notes | May 21, 2026",
        type: "other",
        publishedAt: "2026-05-21",
      },
      {
        url: "https://www.themesatribune.com/news/big-data-center-in-se-mesa-passes-first-review/article_91081b9b-d2d1-47f6-91d2-b600115e4a55.html",
        title: "Big data center in SE Mesa passes first review",
        type: "news",
      },
    ],
    notes:
      "NTT Global Data Centers sought rezoning, a council use permit and a major site plan modification for ~170 acres at Pecos and Crismon roads (Pacific Proving Technology Park; seven buildings, ~2.3m sq ft reported by the aggregator, ~1.7m sq ft in other coverage; 360MW planned). The Planning and Zoning Board voted 4-0 in May 2026 to RECOMMEND approval, adding a condition for a revised drought-tolerant landscape plan. Council introduction was set for 2026-06-08 with final action expected 2026-07-20. Recorded as pending: I could not confirm the exact P&Z date or the council outcome. themesatribune fetch returned HTTP 429; queencreektribune fetch returned HTTP 451.",
  },
  {
    datacenterSlug: "homer-city-ai-campus-pa",
    kind: "water",
    issuingBody: "Pennsylvania Department of Environmental Protection",
    issuedDate: "2026-07-18",
    status: "granted",
    sources: [
      {
        url: "http://paenvironmentdaily.blogspot.com/2026/07/dep-issues-corrected-chapter-105-permit.html",
        title:
          "DEP Issues Corrected Chapter 105 Permit For Wetlands Impacts At The Homer City Generation Data Center Project In Indiana County",
        type: "permit",
        publishedAt: "2026-07-18",
      },
    ],
    notes:
      "Corrected Chapter 105 water obstruction and encroachment permit issued to Homer City Generation for the data center campus in Blacklick and Center townships, Indiana County, PA. Notice published in the 2026-07-18 PA Bulletin; 30-day appeal window to the Environmental Hearing Board ran to 2026-08-17. Revised authorised wetland impacts: ~0.85 acre temporary and 1.61 acres permanent, after Wetland W22 (0.02 acre) inside the water treatment plant footprint was reclassified from temporary to permanent. Mitigation via Laurel Hill Creek Mitigation Bank credits (First Pennsylvania Resource LLC) plus PIESCES programme credits. Blog post reproduces the PA Bulletin notice; the underlying DEP file was not fetched.",
  },
  {
    datacenterSlug: "aws-falls-township-pa",
    kind: "environmental",
    issuingBody:
      "Pennsylvania Department of Environmental Protection, Southeast Regional Office",
    appliedDate: "2026-07-18",
    status: "pending",
    sources: [
      {
        url: "http://paenvironmentdaily.blogspot.com/2026/07/dep-invites-comments-on-air-quality_01767808813.html",
        title:
          "DEP Invites Comments On Air Quality Permit For 282 Generators For Amazon Data Center Project In Falls Twp., Bucks County",
        type: "permit",
        publishedAt: "2026-07-18",
      },
    ],
    notes:
      "Air Quality Plan Approval application for the Amazon data center project in Falls Township, Bucks County, PA, covering 280 natural-gas-fired generators plus two diesel-fired generators (282 total). PA Bulletin notice published 2026-07-18 (page 4278); public comment deadline 2026-08-17; no hearing scheduled but one may be requested. appliedDate here is the public-notice date, not the application receipt date, which the notice does not give. Plan approval number not stated in the notice as reproduced.",
  },
  {
    datacenterSlug: "aws-energy-way-hamlet-nc",
    kind: "environmental",
    issuingBody:
      "North Carolina Department of Environmental Quality, Division of Air Quality",
    status: "pending",
    sources: [
      {
        url: "https://www.deq.nc.gov/news/events/public-hearing-preliminary-determination-air-quality-permit-applications-amazon-data-services-and",
        title:
          "Public Hearing: Preliminary Determination on Air Quality Permit Applications for Amazon Data Services and Duke Energy Progress",
        type: "permit",
        publishedAt: "2026-06",
      },
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-june-30-2026/",
        title: "Data Centers: Daily Notes | June 30, 2026",
        type: "other",
        publishedAt: "2026-06-30",
      },
    ],
    notes:
      "Paired draft air quality permits: Amazon Data Services, Inc. for the Energy Way Tech Campus at 198 Energy Way, Hamlet, Richmond County NC; and Duke Energy Progress, LLC for turbines at 1761 Airport Road, Hamlet, supporting the Amazon campus. NCDEQ issued a preliminary determination and set a public hearing for 2026-07-30 at 6pm, Old Richmond County Courthouse, Rockingham; comments accepted through 2026-07-31. Secondary reporting describes a 21-building campus with about 1,600MW of diesel generation emitting between 100 and 250 tons/year each of NOx, CO and VOCs; the NCDEQ notice itself does not state generator counts or MW, so those figures are reported, not confirmed. Permit application numbers not given on the notice page.",
  },
  {
    datacenterSlug: "red-admiral-rochfortbridge-westmeath",
    kind: "zoning",
    issuingBody:
      "Westmeath County Council (Ireland); under appeal to An Bord Pleanala",
    issuedDate: "2026-06",
    status: "granted",
    sources: [
      {
        url: "https://www.thejournal.ie/westmeath-data-centre-stalled-7094643-Jul2026/",
        title:
          "Plans for controversial EUR1bn data centre campus in Co Westmeath stalled after 10 appeals lodged",
        type: "news",
        publishedAt: "2026-07-07",
      },
    ],
    notes:
      "Westmeath County Council granted planning permission in June 2026 (exact day not published in the source) for the Red Admiral DC campus across Rochfortbridge townlands: a six-unit data centre plus a decentralised energy resource and solar farm on about 600 acres, valued at around EUR1 billion. Applicant Red Admiral DC Ltd, owned by Nigel Reams (Lumcloon Energy Group). Permission granted despite 55 local submissions; 10 third-party appeals were lodged with An Bord Pleanala in July 2026 and a decision on appeal was due in October 2026, so the permission is not yet operative. Projected emissions cited: 493,000 tonnes CO2 per year. No MW figure published.",
  },
  {
    datacenterSlug: "google-hermantown-mn",
    kind: "zoning",
    issuingBody: "Hermantown (Minnesota) City Council",
    issuedDate: "2026-06-02",
    status: "granted",
    sources: [
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-june-2-2026/",
        title: "Data Centers: Daily Notes | June 2, 2026",
        type: "other",
        publishedAt: "2026-06-02",
      },
    ],
    notes:
      "City council voted 4-1 to amend the land use plan and expand the Urban Service Boundary, allowing sewer and water to be extended to the Adolph neighbourhood - the enabling step for a Google data center. Single secondary source (aggregator citing Northern News Now). Not itself a data center permit; recorded because it is the land-use action that unlocks the site.",
  },
  {
    datacenterSlug: "stack-berry-hill-va",
    kind: "other",
    issuingBody: "Pittsylvania County (Virginia) Board of Supervisors",
    issuedDate: "2026-07-21",
    status: "granted",
    sources: [
      {
        url: "https://wset.com/newsletter-daily/gallery/pittsylvania-county-advances-100b-data-center-campus-proposal-despite-resident-concerns-berry-hill-july-2026",
        title:
          "Pittsylvania County advances $100B data center campus proposal despite resident concerns",
        type: "news",
        publishedAt: "2026-07",
      },
      {
        url: "https://www.chathamstartribune.com/news/article_47c5933f-e69c-429a-b5d9-251971911f97.html",
        title:
          "Pittsylvania County supervisors support expedited permitting for data center in megasite",
        type: "news",
      },
    ],
    notes:
      "NOT A PERMIT IN THE STRICT SENSE: on Tuesday 2026-07-21 the Board of Supervisors adopted a RESOLUTION supporting a proposed ~$100 billion data center campus at the Berry Hill / Southern Virginia Megasite, and (per the Chatham Star Tribune headline) supporting expedited permitting for it. Recorded as kind 'other' because it is the formal public-body action inside the window. Vote tally not published. Claimed jobs: about 2,500 over two decades; build-out described as 15-30 years; campus said to use recycled water. Operator not named in the WSET piece; earlier 2026 reporting identifies STACK Infrastructure as buying ~3,000 acres for about $720m with a stated $73 billion investment over 30 years - that conflicts with the $100 billion figure used in July, so both are noted here. The underlying 2026-01-15 MSVMS rezoning of ~3,500 acres predates this window. chathamstartribune fetch returned HTTP 429; virginiabusiness fetch returned HTTP 403.",
  },
];

export const REFRESH_2026_07_SUBSIDIES: SeedSubsidy[] = [
  {
    datacenterSlug: "cologix-johnstown-oh",
    recipientBrandSlug: "cologix",
    kind: "tax-abatement",
    awardedBy: "Ohio Tax Credit Authority",
    jurisdiction: "US-OH",
    amountUsd: 42300000,
    announcedDate: "2026-06-02",
    termYears: 13,
    claimedJobs: 90,
    claimedCapexUsd: 1170000000,
    sources: [
      {
        url: "https://signalcleveland.org/ohio-approves-last-data-center-exemption-before-moratorium/",
        title: "2 Ohio data centers get $42M tax break before pause",
        type: "news",
        publishedAt: "2026-06",
      },
    ],
    notes:
      "SINGLE AWARD COVERING TWO SITES - do not double-count. The Ohio Tax Credit Authority approved a $42.3m sales-tax exemption on data center equipment for Cologix Inc. on Monday 2026-06-02, covering both a 25-acre Delaware County site (initially 25MW, up to 75MW) and a 150-acre Johnstown, Licking County site (initially 75MW, up to 176MW). Attached here to the Johnstown site; the Delaware County site is listed in unmatchedSlugs as cologix-delaware-county-oh. JOBS GAP: 90 full-time jobs by 2035 against $1.17bn of construction spending - about $470,000 of state tax forgiveness per job - with a $10m total payroll, roughly $111,000 per job. Minimum 13-year operating commitment. Total planned power across both sites: 800MW. Signal Cleveland notes this was the LAST such exemption Ohio approved before Governor DeWine announced an indefinite pause days later, and that Ohio's cumulative data center exemption cost since 2025 had reached nearly $2.17 billion.",
  },
  {
    datacenterSlug: "prologis-trenton-oh",
    recipientBrandSlug: "prologis",
    kind: "tax-abatement",
    awardedBy: "Trenton (Ohio) City Council",
    jurisdiction: "US-OH",
    announcedDate: "2026-07-09",
    termYears: 15,
    claimedJobs: 120,
    sources: [
      {
        url: "https://www.wvxu.org/environment/2026-07-09/trenton-approves-15-year-tax-abatement-for-data-center",
        title: "Trenton approves 15-year tax abatement for data center",
        type: "news",
        publishedAt: "2026-07-09",
      },
    ],
    notes:
      "15-year, 75% property tax abatement on the value of the planned data center buildings, approved Thursday 2026-07-09; vote tally not reported. No headline dollar value for the abatement was published: the reported effect is that taxable building value falls from $233 million to about $58 million, with total taxable value including land near $68 million, and roughly $1.3 million a year in property tax to the city and school district. amountUsd deliberately omitted rather than derived. Project: 250MW campus, four 220,000 sq ft buildings plus an electrical substation on 140 acres off Woodsdale Road, next to homes, soccer fields and farmland. JOBS: 120 new full-time jobs promised by 2035-12-31, payroll about $9 million (~$75,000 per job). Trenton is in Butler County, Ohio (not Trenton, New Jersey - an earlier search result mislabelled it).",
  },
  {
    datacenterSlug: "related-the-barn-saline-mi",
    recipientBrandSlug: "related-digital",
    kind: "tax-abatement",
    awardedBy: "Saline Township (Washtenaw County, Michigan) Board of Trustees",
    jurisdiction: "US-MI",
    announcedDate: "2026-07-14",
    termYears: 12,
    sources: [
      {
        url: "https://www.wxyz.com/news/data-centers/saline-township-board-approves-oracle-tax-abatement-cap-it-at-original-4-8b-project-cost",
        title:
          "Saline Township board approves Oracle tax abatement, caps it at original $4.8B project cost",
        type: "news",
        publishedAt: "2026-07",
      },
      {
        url: "https://www.michiganpublic.org/environment-climate-change/2026-07-15/saline-township-approves-smaller-than-planned-tax-breaks-for-open-ai-data-center",
        title:
          "Saline Township approves smaller-than-planned tax breaks for Open AI data center",
        type: "news",
        publishedAt: "2026-07-15",
      },
      {
        url: "https://civicmedia.us/news/2026/07/16/massive-data-center-wins-local-tax-break-but-9-times-smaller-than-requested",
        title:
          "Massive data center wins local tax break - but 9 times smaller than requested",
        type: "news",
        publishedAt: "2026-07-16",
      },
      {
        url: "https://bridgemi.com/business-watch/massive-data-center-wins-local-tax-break-but-9-times-smaller-than-requested/",
        title:
          "Massive data center wins local tax break - but 9 times smaller than requested",
        type: "news",
        publishedAt: "2026-07-16",
      },
      {
        url: "https://www.cbsnews.com/detroit/news/saline-township-trustees-vote-no-data-center-tax-abatement/",
        title:
          "Saline Township trustees vote against proposed 50% tax abatement for data center",
        type: "news",
        publishedAt: "2026-07-14",
      },
      {
        url: "https://planetdetroit.org/2026/07/data-center-news-saline-township/",
        title:
          "Data center news: Saline Township reverses course, drops cap on data center tax break",
        type: "news",
        publishedAt: "2026-07-21",
      },
    ],
    notes:
      "12-year, 50% abatement on real and personal property taxes for 'The Barn' - a 250-acre campus developed by Related Digital / The Related Companies for Oracle and its customer OpenAI, near Ann Arbor. THREE-STEP SEQUENCE INSIDE THE WINDOW: (1) 2026-07-08 the board VOTED DOWN the 50%/12-year abatement after two packed meetings; (2) the following Tuesday the board unanimously APPROVED it but capped it at the $4.8 billion valuation written into a 2025 consent judgment rather than the project's current ~$43 billion valuation, and added a clawback letting taxing authorities recover the break if the project is not completed or does not operate; (3) around 2026-07-21 the board REVERSED itself and dropped the $4.8bn cap after the township attorney warned the cap violated that consent judgment. DOLLAR GAP: under the cap the break was worth less than $20 million a year; the developer's request at full valuation was worth about $147 million a year. amountUsd omitted rather than derived. DATE CONFLICT: WXYZ reported trustees were due to vote 2026-07-14 and describe a 'Tuesday night' approval; Michigan Public (published 07-15) and Bridge/Civic Media (published 07-16) also say 'Tuesday'; two fetch summaries rendered that as July 15. 2026-07-14 was the Tuesday, so that date is used. At full $43bn valuation the untaxed base would have generated about $294m/year, of which about $105m to education and $27m to Washtenaw County. Other investment figures in circulation: $4.8bn (consent judgment), $16bn (reported investment), $43bn (current valuation). No job figures published. Related said it was 'evaluating the validity of the Board's actions'.",
  },
  {
    datacenterSlug: "beale-claremore-ok",
    recipientBrandSlug: "beale-infrastructure",
    kind: "tax-abatement",
    awardedBy: "Claremore (Oklahoma) City Council",
    jurisdiction: "US-OK",
    announcedDate: "2026-05-18",
    termYears: 25,
    claimedJobs: 50,
    sources: [
      {
        url: "https://www.newson6.com/tulsa-oklahoma-news/claremore-project-mustang-data-center-approved",
        title: "Claremore approves Project Mustang data center plan",
        type: "news",
        publishedAt: "2026-05",
      },
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-may-19-2026/",
        title: "Data Centers: Daily Notes | May 19, 2026",
        type: "other",
        publishedAt: "2026-05-19",
      },
      {
        url: "https://claremore.com/project-mustang-faq/",
        title: "Proposed Claremore Data Center Project - Project Mustang FAQ",
        type: "other",
      },
    ],
    notes:
      "City Council approved the Project Mustang agreement on Monday 2026-05-18; no vote tally published. The agreement lets Beale Infrastructure seek a 25-year ad valorem tax exemption for EACH PHASE of up to three data centers in the Claremore Industrial Park; a local tax-increment committee had recommended a 100% property tax exemption. In place of ad valorem taxes the developer would make escalating payments in lieu of taxes flowing to Rogers County school districts and other taxing entities. JOBS: about 50 permanent jobs per phase, against 'nearly a billion dollars' of investment per phase (too vague to record as claimedCapexUsd). Developer claims more than $250 million contributed to schools, municipal services and community programmes over time - that is the developer's own figure, not an audited one. Power from Grand River Dam Authority (existing utility slug grand-river-dam-authority); water and wastewater from the City of Claremore; air-cooled, ~20,000 gallons/day claimed. claremore.com FAQ was cited by the aggregator but I did not fetch it directly.",
  },
  {
    datacenterSlug: "google-van-buren-mi",
    recipientBrandSlug: "google",
    kind: "tax-abatement",
    awardedBy: "Van Buren Township (Wayne County, Michigan) Board of Trustees",
    jurisdiction: "US-MI",
    amountUsd: 125000000,
    termYears: 12,
    claimedJobs: 51,
    sources: [
      {
        url: "https://writing.strisker.com/data-centers-daily-notes-july-13-2026/",
        title: "Data Centers: Daily Notes | July 13, 2026",
        type: "other",
        publishedAt: "2026-07-13",
      },
      {
        url: "https://www.themidwesterner.news/2026/05/van-buren-twp-officials-dole-out-125-million-in-tax-breaks-for-google-data-center/",
        title:
          "Van Buren Twp officials dole out $125 million in tax breaks for Google data center",
        type: "news",
        publishedAt: "2026-05",
      },
      {
        url: "https://www.mlive.com/news/2026/07/big-tech-spent-thousands-lobbying-now-its-michigan-data-centers-could-get-big-tax-breaks.html",
        title:
          "Big Tech spent thousands lobbying. Now its Michigan data centers could get big tax breaks",
        type: "news",
        publishedAt: "2026-07",
      },
    ],
    notes:
      "DATE NOT PINNED - announcedDate deliberately omitted. Van Buren Township trustees approved roughly $125 million in local property tax breaks over 12 years for Google's 1GW 'Project Cannoli' data center at a 280-acre site near I-94 and Haggerty Road being developed by Panattoni Development. The Midwesterner published the story under a May 2026 URL and describes the approval as happening 'this week'; the strisker aggregator places it in July 2026. Both are inside the research window, so the record stands, but the month is genuinely unresolved. Alongside the abatement, Google agreed to pay $15-15.4 million toward township infrastructure, maintain at least 51 full-time employees at the data center, and contract at least 5% of construction to local companies. Google's projected annual tax payments even after the discount: $6-12 million. JOBS GAP: 51 permanent jobs for a 1-gigawatt campus. Residents have since launched a recall effort against the township board. VERIFICATION LIMIT: only the secondary aggregator fetched successfully - themidwesterner returned HTTP 403, mlive.com could not be fetched, and both vbtmi.gov pages returned HTTP 403. The preliminary site plan approval (Planning Commission, 5-2, February 2026) predates this window.",
  },
];

export const REFRESH_2026_07_REFUSED_SUBSIDIES: RefusedSubsidy[] = [
  {
    datacenterSlug: "dynamo-archer-county-tx",
    recipientBrandSlug: "dynamo-ventures",
    decision: "denied",
    kind: "tax-abatement",
    awardedBy: "Archer County (Texas) Commissioners Court",
    jurisdiction: "US-TX",
    announcedDate: "2026-06-22",
    sources: [
      {
        url: "https://www.newschannel6now.com/2026/06/22/archer-county-commissioners-deny-tax-abatement-proposed-data-center/",
        title:
          "Archer County Commissioners deny tax abatement for proposed data center",
        type: "news",
        publishedAt: "2026-06-22",
      },
    ],
    notes:
      "NOT AWARDED. Commissioners voted unanimously on Monday 2026-06-22 against a tax abatement for a data center proposed by Dynamo Ventures LLC, expected eventually to serve as infrastructure for Google. Over 30 residents attended in opposition. County Judge Randy Jackson wanted to wait for Texas Legislature restrictions and said 'I never wanted it to come to Archer County'. Officials acknowledged the abatement would have given the county leverage over infrastructure and local hiring commitments; refusing it removes that leverage but does not stop the project. Abatement terms sought, capex and job claims were not disclosed. Placed outside records.subsidies so a seed script cannot mistake it for an award.",
  },
  {
    datacenterSlug: "digipower-x-columbiana-al",
    recipientBrandSlug: "digipower-x",
    decision: "denied",
    kind: "tax-abatement",
    awardedBy: "Columbiana (Alabama) City Council",
    jurisdiction: "US-AL",
    announcedDate: "2026-05-05",
    termYears: 9,
    sources: [
      {
        url: "https://abc3340.com/news/local/columbiana-council-unanimously-rejects-major-tax-break-for-proposed-data-center",
        title:
          "Columbiana Council unanimously rejects major tax break for proposed data center",
        type: "news",
        publishedAt: "2026-05",
      },
    ],
    notes:
      "NOT AWARDED. On Tuesday 2026-05-05 the city council unanimously rejected a resolution that would have started the abatement process for DigiPower X at 130 Industrial Parkway, Columbiana - 100% of city property taxes for nine years. The mayor left open reconsidering 'a different amount', implying the 100%/9-year ask was seen as too generous rather than the project being opposed. Capex, jobs and MW not disclosed. Placed outside records.subsidies so a seed script cannot mistake it for an award.",
  },
  {
    datacenterSlug: "related-the-barn-saline-mi",
    recipientBrandSlug: "related-digital",
    decision: "denied-then-reversed",
    kind: "tax-abatement",
    awardedBy: "Saline Township (Washtenaw County, Michigan) Board of Trustees",
    jurisdiction: "US-MI",
    announcedDate: "2026-07-08",
    termYears: 12,
    sources: [
      {
        url: "https://www.cbsnews.com/detroit/news/saline-township-trustees-vote-no-data-center-tax-abatement/",
        title:
          "Saline Township trustees vote against proposed 50% tax abatement for data center",
        type: "news",
        publishedAt: "2026-07-14",
      },
    ],
    notes:
      "The initial 2026-07-08 vote AGAINST the 12-year/50% abatement, which was superseded six days later by the capped approval and then by the removal of the cap. Recorded here only so the sequence is not lost; the awarded outcome is the record in records.subsidies for related-the-barn-saline-mi. CBS Detroit describes the meeting as 'Tuesday evening' but dates it 2026-07-08, which was a Wednesday; WXYZ's account of the same meeting says Wednesday.",
  },
];

export const REFRESH_2026_07_CAPEX: CapexUpdate[] = [
  {
    datacenterSlug: "aws-anthropic-new-carlisle-in",
    capexUsd: 13800000000,
    sources: [
      {
        url: "https://www.wndu.com/2026/07/23/amazon-web-services-investment-st-joseph-county-data-center-campus-surpasses-138-billion/",
        title:
          "Amazon Web Services investment in St. Joseph County data center campus surpasses $13.8 billion",
        type: "news",
        publishedAt: "2026-07-23",
      },
    ],
    notes:
      "Money already spent, not a pledge. Brandon Oyer, AWS director of power and water for the Americas, said on 2026-07-23: 'Today we're announcing we've already invested 13.8 billion dollars and we're only part of the way done.' Exceeds the original $11bn commitment made in 2024. Campus is in Olive Township / New Carlisle, St. Joseph County, Indiana (Indiana Enterprise Center); ~30 buildings planned, ~18 operational at the time of the statement. Same site as the Project Rainier / Anthropic build already tracked under this slug. County abatement-compliance review had recorded $8.9bn invested as of 2026-01-01, so this is a genuine in-window increase. Sourcing is a local TV report quoting the AWS executive directly; no AWS press release or SEC filing states the site-level figure.",
  },
  {
    datacenterSlug: "meta-temple-tx",
    capexUsd: 1200000000,
    sources: [
      {
        url: "https://www.kwtx.com/2026/07/22/meta-goes-live-temple-with-12-billion-ai-data-center/",
        title: "Meta goes live in Temple with $1.2 billion AI data center",
        type: "news",
        publishedAt: "2026-07-22",
      },
    ],
    notes:
      "Site went live 2026-07-22. Reported wording: 'The campus spans more than 760,000 square feet across two buildings and represents an investment of more than $1.2 billion once completed.' Figure is a floor ('more than $1.2 billion'), so 1.2e9 is a lower bound, not an exact spend. Capacity reported at roughly 198MW; the campus is 393 acres at 3101 Industrial Boulevard. NOTE: the existing slug list contains BOTH 'meta-temple' and 'meta-temple-tx' for what appears to be the same site - this record is attached to 'meta-temple-tx' and the duplicate should be reconciled. Meta's own newsroom post for this opening could not be located; datacenterdynamics.com coverage returned HTTP 403.",
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    capexUsd: 50000000000,
    sources: [
      {
        url: "https://about.fb.com/news/2026/07/teachers-local-businesses-win-as-meta-expands-louisiana-data-center/",
        title:
          "Teachers and Local Businesses Win as Meta Expands Louisiana Data Center",
        type: "operator",
        publishedAt: "2026-07-13",
      },
      {
        url: "https://www.knoe.com/2026/07/13/gov-landry-meta-formally-announce-louisiana-data-centers-historic-expansion/",
        title:
          "Gov. Landry, Meta formally announce Louisiana data center's historic expansion",
        type: "news",
        publishedAt: "2026-07-13",
      },
    ],
    notes:
      "SLUG NOTE: existing-datacenter-slugs.txt did not contain this site when I started, but a parallel researcher added 'meta-hyperion-richland' to it during the session, so this record attaches to that slug rather than creating a duplicate. Announced 2026-07-13 by Gov. Jeff Landry and Meta president/vice chair Dina Powell McCormick. Meta's own newsroom wording: 'The data center expansion is an investment of more than $50 billion in the Richland Parish region.' Capacity expanded from 2GW to 5GW. 50e9 is therefore a FLOOR, not an exact figure. DISPUTE: Bloomberg reported the same day that the campus will 'surpass a $250 billion price tag' - that fetch returned HTTP 403 so the framing could not be verified; the $250bn number is far above the operator's own and the state's own figure and most likely covers total lifetime spend including compute hardware rather than site construction. The more primary figure (Meta newsroom + Louisiana governor) is used for the field value. Separately disclosed and NOT included in capexUsd: >$1bn for local road/water/wastewater infrastructure, $1.6bn already contracted to Louisiana businesses since the Dec-2024 groundbreaking, and a $5m grant to Louisiana Delta Community College.",
  },
  {
    datacenterSlug: "meta-el-paso-tx",
    capexUsd: 14000000000,
    sources: [
      {
        url: "https://www.prnewswire.com/news-releases/meta-announces-new-strategic-venture-with-blackrock-to-develop-data-center-in-el-paso-302836040.html",
        title:
          "Meta Announces New Strategic Venture with BlackRock to Develop Data Center in El Paso",
        type: "pr",
        publishedAt: "2026-07-28",
      },
    ],
    notes:
      "Meta's own release, 2026-07-28. Verbatim: 'The parties have committed to fund their respective pro rata share of the approximately $14 billion in total development costs for the buildings and long-lived power, cooling, and connectivity infrastructure at the campus.' This is a construction-cost figure for a specific campus, so it qualifies as site capex. The other figures in the same release are FINANCING and are deliberately excluded from capexUsd: $12.5bn of debt, BlackRock's ~$4.9bn cash contribution, Meta's ~$2.3bn contribution of land and construction-in-progress, a ~$1bn one-time distribution to Meta, and ~$13bn of residual value guarantees. 1GW of compute; already under construction with ~2,300 workers on site; online from 2028; BlackRock-managed funds own 80%, Meta 20%.",
  },
  {
    datacenterSlug: "openai-camellia-effingham-ga",
    capexUsd: 20000000000,
    sources: [
      {
        url: "https://www.wtoc.com/2026/07/22/openai-announces-plans-new-data-center-effingham-county/",
        title:
          "OpenAI announces plans for a new data center campus in Effingham County",
        type: "news",
        publishedAt: "2026-07-22",
      },
      {
        url: "https://thecurrentga.org/2026/07/22/20-billion-openai-data-center-to-open-in-effingham-county/",
        title: "$20 billion OpenAI data center to open in Effingham County",
        type: "news",
        publishedAt: "2026-07-22",
      },
      {
        url: "https://openai.com/index/building-ai-infrastructure-with-the-effingham-county-community/",
        title: "Building AI infrastructure with the Effingham County community",
        type: "operator",
        publishedAt: "2026-07-22",
      },
    ],
    notes:
      "'Project Camellia', announced 2026-07-22 jointly by the Effingham County Industrial Development Authority, the county Board of Commissioners and the Effingham County School District. Reported wording: 'The project represents a $20 billion capital investment - described as one of the largest private capital investments in the history of coastal Georgia - and is expected to create 400 long-term jobs.' Described as privately funded, four buildings at the 2,600-acre Savannah Gateway Industrial Hub near Rincon. 3.2GW contracted from Georgia Power, delivered in phases 2028-2032, with up to 1,000MW of flexible demand response under a 25-year agreement. CAVEAT: OpenAI receives a 50% property tax abatement for 15 years, so this figure is partly a claim made in an incentive context. OpenAI's own announcement page (openai.com, third source above) returned HTTP 403 to both WebFetch and curl, so the operator's own wording is UNVERIFIED; the $20bn rests on the two local news reports of the joint government announcement. Separate community figures not in capexUsd: $80m community investment fund, $71m of coding classes.",
  },
  {
    datacenterSlug: "aws-montgomery-county-mo",
    capexUsd: 10000000000,
    sources: [
      {
        url: "https://www.prnewswire.com/news-releases/amazon-selects-missouri-for-10-billion-data-center-campus-302800859.html",
        title: "Amazon Selects Missouri for $10 Billion Data Center Campus",
        type: "pr",
        publishedAt: "2026-06-15",
      },
    ],
    notes:
      "Amazon's own release, 2026-06-15. Verbatim: 'Amazon today announced plans to invest $10 billion in Missouri to construct a new, state-of-the-art data center campus.' Money is tied to construction of one named campus, so it qualifies. Site is ~1,000 acres at New Florence, Montgomery County, at the I-70 / Highway 19 interchange; local reporting refers to it as 'Project Green'. 400+ full-time jobs. Amazon states it will pay 100% of the cost of electric service via Ameren Missouri with no rate incentives or discounts. Community figures excluded from capexUsd: $3m emergency dispatch, $3m community programs, $1m+ community gathering space, $150k community fund. The Missouri governor's press release (governor.mo.gov) was blocked by an Incapsula 403 and could not be used.",
  },
  {
    datacenterSlug: "applied-digital-delta-forge-boyce-la",
    capexUsd: 3600000000,
    sources: [
      {
        url: "https://www.opportunitylouisiana.gov/news/central-louisiana-secures-3-6-billion-applied-digital-ai-factory-campus",
        title:
          "Central Louisiana Secures $3.6 Billion Applied Digital AI Factory Campus",
        type: "other",
        publishedAt: "2026-05-26",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1144879/000114487926000044/apldq426earningsreleaseasf.htm",
        title:
          "Applied Digital Reports Fiscal Fourth Quarter and Full Year 2026 Results (EX-99.1 to Form 8-K)",
        type: "filing",
        publishedAt: "2026-07-27",
      },
    ],
    notes:
      "FLAGGED - GOVERNMENT/SUBSIDY-CONTEXT CLAIM. The $3.6bn comes from Louisiana Economic Development, not from Applied Digital's SEC filings. LED wording, 2026-05-26: 'Applied Digital Corporation announced plans to develop a $3.6 billion, state-of-the-art artificial intelligence (AI) factory campus in Rapides Parish.' The announcement is made alongside Louisiana's data-centre sales-and-use tax exemption (Act 730 of 2024), so the figure is a claimed capex in an incentive context, not audited spend. Applied Digital's own 8-K of 2026-07-27 confirms the site ('Delta Forge 1, a new AI Factory campus in Boyce, Louisiana', 300MW critical IT load, initial operations expected in calendar 2027) but states NO capex for it - the $7.5bn it discloses for Delta Forge 1 is 15-year take-or-pay CONTRACTED LEASE REVENUE, not capital spend, and must not be read as capex.",
  },
  {
    datacenterSlug: "qts-lancium-hall-county-tx",
    capexUsd: 10000000000,
    sources: [
      {
        url: "https://q.com/news/qts-and-lancium-announce-data-center-campus-in-hall-county-texas/",
        title:
          "QTS and Lancium Announce Data Center Campus in Hall County, Texas",
        type: "pr",
        publishedAt: "2026-07-13",
      },
      {
        url: "https://baxtel.com/news/qts-to-develop-11-data-centers-at-lancium-campus-in-hall-county-texas",
        title:
          "QTS To Develop 11 Data Centers At Lancium Campus In Hall County, Texas",
        type: "news",
        publishedAt: "2026-07-15",
      },
    ],
    notes:
      "QTS's own release, 2026-07-13. Verbatim: 'QTS Data Centers (\"QTS\") and Lancium today announced a data center campus expected to bring more than $10 billion in capital investment to the region.' 10e9 is a FLOOR ('more than'). Wording is 'capital investment to the region' rather than 'spent on this campus', which is slightly looser than ideal, but the release describes a single named campus. Site is near Turkey, Hall County, Texas; trade reporting adds up to 11 buildings across 465 acres with a 1GW grid connection, solar and battery storage supplied by Lancium, and closed-loop cooling to avoid drawing on Turkey's municipal water. Up to 7,000 peak construction jobs and ~350 permanent jobs. The release does not state MW or acreage itself.",
  },
  {
    datacenterSlug: "pure-dc-seinajoki-sjk01",
    capexUsd: 8550000000,
    sources: [
      {
        url: "https://puredc.com/2026/07/14/pure-dc-launches-one-of-europes-largest-ever-ai-infrastructure-projects",
        title:
          "Pure DC Launches One of Europe's Largest Ever AI Infrastructure Projects",
        type: "operator",
        publishedAt: "2026-07-14",
      },
      {
        url: "https://baxtel.com/news/pure-dc-lands-1-3bn-to-fund-finland-data-center-project",
        title: "Pure DC Lands EUR1.3bn to Fund Finland Data Center Project",
        type: "news",
        publishedAt: "2026-07-22",
      },
    ],
    notes:
      "CURRENCY CONVERSION. Original figure is 'more than EUR 7.5 billion' for the full SJK01 campus buildout, stated by Pure DC on 2026-07-14; Phase 1 alone is 'more than EUR 1.5 billion' for 110MW. Recorded 8.55e9 USD using 1.14 USD/EUR, which is the conversion the trade press (Baxtel / Data Center Knowledge) applied to this same figure in July 2026 - I did NOT fetch an independent FX source, so treat the USD value as approximate and the EUR value as authoritative. Both figures are floors ('more than'). Site: Seinajoki, Finland, 370 acres, 110MW phase 1 rising to 550MW+, ~700MVA of renewable power available, direct-liquid-cooled 40MW modules, decade-long build, 3,000+ construction jobs, zero operational water use. NOT counted as capex: EUR 1.3bn of senior debt financing announced 2026-07-21, a $2.7bn funding package in May 2026, and the company's claim of '$4.2 billion secured over the past 12 months' - all financing, not spend. Phase 1 is reported as fully leased, with Microsoft named in trade reporting as a customer (unconfirmed by Pure DC).",
  },
  {
    datacenterSlug: "stream-graham-tx",
    capexUsd: 10000000000,
    sources: [
      {
        url: "https://baxtel.com/news/stream-proposes-867-acre-data-center-campus-in-graham-texas",
        title: "Stream Proposes 867-Acre Data Center Campus in Graham, Texas",
        type: "news",
        publishedAt: "2026-07-18",
      },
    ],
    notes:
      "WEAKEST RECORD IN THIS SET - treat as a developer planning estimate, not a commitment. Reported wording: the project 'would require around $10 billion in investment'. Proposed by Headwaters Site Development, an affiliate of Stream Data Centers, on ~867-890 acres south of Lake Graham, Young County, Texas, bounded by FM 61 and FM 209; 15 buildings planned; capacity not disclosed; site design under way with construction targeted for early 2027 subject to power scheduling and finding a hyperscale customer. No formal application had been confirmed and Graham City Council was being urged on 2026-07-10 to postpone tax-abatement negotiations. Sourcing is a trade aggregator only: the underlying datacenterdynamics.com report returned HTTP 403 and grahamleader.com returned HTTP 429/connection reset, so no primary or first-hand source was reachable. Related but separate: Plug Power agreed to sell Stream the 66-acre Graham site and its 164MW grid interconnection for up to $76.5m (announced 2026-07-13).",
  },
];

export const REFRESH_2026_07_COMMITMENTS: RefreshCommitment[] = [
  {
    slug: "microsoft",
    pct: 100,
    year: 2030,
    url: "https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/msc/documents/presentations/CSR/2026-Microsoft-Environmental-Sustainability-Report-PDF.pdf",
    notes:
      "WEAKENED / EFFECTIVELY DROPPED - this is a negative finding, not a live pledge. Microsoft's '100/100/0' goal read, verbatim in the 2025 Environmental Sustainability Report: 'By 2030, 100% of our electricity consumption will be matched by zero carbon electricity purchases 100% of the time.' That sentence is GONE from the 2026 Environmental Sustainability Report (PDF CreationDate 2026-07-03, ModDate 2026-07-15, announced 2026-07-09 - inside the window). Verified by extracting both PDFs with pdftotext and string-matching: 'electricity consumption will be matched' appears once in the 2025 report and zero times in the 2026 report; '100% of the time' likewise 1 -> 0; and the 2026 report contains no 'by 2030' electricity or carbon-free-energy target of any kind. The only 2030 goals it still lists are carbon negative, water positive and zero waste. The replacement language is qualitative and has no percentage and no year: 'Microsoft will continue to push for an expansive focus on adding all forms of carbon-free electricity (CFE) to the grids where we operate.' The 100% renewable pledge is now referred to in the past tense in the endnotes as 'Our 2025 100% renewable target'. Microsoft has published no explicit retirement statement, and the separate Environmental Data Fact Sheet was not checked. Corroborating in-window reporting: Bloomberg reported on 2026-05-06 that Microsoft was 'considering dropping' the target and that no final decision had been made (Bloomberg itself is paywalled/403; carried by TechCrunch 2026-05-06 and CarbonCredits 2026-05-08). IMPORTANT SCOPE NOTE: Microsoft is still listed as an RE100 member with a 100%-renewable target year of 2030 on the Climate Group's live member list (verified 2026-07-29). What was dropped is the far stricter hourly, same-grid, zero-carbon matching goal - not annual renewable matching, which Microsoft says it met in FY25.",
  },
  {
    slug: "meta",
    pct: 100,
    year: 2020,
    url: "https://techcrunch.com/2026/07/23/meta-drops-out-of-a-major-clean-energy-pact-as-its-natural-gas-buildout-accelerates/",
    notes:
      "DROPPED - this is a negative finding. Meta left RE100 after about a decade of membership; the exit was confirmed by Meta to TechCrunch on 2026-07-23. The pledge Meta had registered with RE100, as reported, was to run its entire operations on renewable electricity by 2020 (a target it reached in 2021), hence pct 100 / year 2020. Verified independently on 2026-07-29 against the Climate Group's live RE100 member list (https://www.theclimategroup.org/re100/re100-members, HTTP 200, 579,518 bytes): no member row for Meta or for Facebook, while Microsoft (2015, 2030), Google (2015, 2017), Iron Mountain (2018, 2050), Telefonica (2017, 2030) and KDDI (2023, 2050) are all still listed. Meta's position after the exit is a year-less claim: a spokesperson said it remains committed to matching data center electricity use 'with 100% clean and renewable energy', and sustainability.atmeta.com now says only 'Continue to match 100% of our electricity use with renewable energy' with no target year and no mention of RE100. Context: reporting ties the exit to Meta's gas buildout - at least a dozen gas plants funded in the past year - and to stricter RE100 reporting criteria. AMBIGUITY: Meta did not announce the exit itself; reports differ on whether it left voluntarily or was removed for failing RE100's technical criteria, and both accounts appear in the coverage.",
  },
];

export const REFRESH_2026_07_OWNERSHIP_EDGES: OwnershipEdgeSeed[] = [
  {
    parentSlug: "ai-infrastructure-partnership",
    childSlug: "aligned",
    effectiveFrom: "2026-07-21",
    sourceUrl:
      "https://aligneddc.com/press-release/aip-mgx-and-blackrocks-gip-close-acquisition-of-aligned-data-centers/",
    notes:
      "DIRECTION: AIP is the buyer/parent, Aligned Data Centers is the acquired child. AIP, MGX and BlackRock's GIP jointly closed the acquisition of '100% of the equity in Aligned Data Centers' on 2026-07-21 from private infrastructure funds managed by Macquarie Asset Management and co-invest partners; enterprise value ~USD 40bn plus USD 5bn committed growth capital. No ownershipPct recorded: the release does NOT disclose how the 100% splits between AIP, MGX and GIP, so any per-party percentage would be false precision. AIP itself is a partnership whose members are BlackRock, GIP, MGX, Microsoft and NVIDIA, with Kuwait Investment Authority and Temasek as financial anchors (per the 2025-10-15 GIP announcement). Datacenterdynamics reports the close as 2026-07-22; Aligned's own release says 2026-07-21 — the operator's own date is used.",
  },
  {
    parentSlug: "mgx",
    childSlug: "aligned",
    effectiveFrom: "2026-07-21",
    sourceUrl:
      "https://aligneddc.com/press-release/aip-mgx-and-blackrocks-gip-close-acquisition-of-aligned-data-centers/",
    notes:
      "DIRECTION: MGX (Abu Dhabi state-linked technology investment company) is a buyer/parent; Aligned is the child. Part of the three-party consortium that acquired 100% of Aligned's equity. Per-party split not disclosed, so ownershipPct is deliberately omitted.",
  },
  {
    parentSlug: "global-infrastructure-partners",
    childSlug: "aligned",
    effectiveFrom: "2026-07-21",
    sourceUrl:
      "https://aligneddc.com/press-release/aip-mgx-and-blackrocks-gip-close-acquisition-of-aligned-data-centers/",
    notes:
      "DIRECTION: BlackRock's Global Infrastructure Partners is a buyer/parent; Aligned is the child. GIP is described in the consortium's own materials as 'part of BlackRock', so the ultimate parent above GIP is BlackRock. Per-party split not disclosed; ownershipPct omitted.",
  },
  {
    parentSlug: "digital-realty",
    childSlug: "teraco",
    ownershipPct: 77,
    sourceUrl:
      "https://www.globenewswire.com/news-release/2026/06/22/3315175/0/en/digital-realty-announces-transactions-to-drive-continued-platform-growth.html",
    notes:
      "DIRECTION: Digital Realty is the parent, Teraco is the child (Digital Realty has held the majority since 2022). Announced 2026-06-22: Digital Realty agreed to acquire an additional ~16% from Teraco minority shareholders for ~USD 650m, principally via issuance of 3.4m DLR common shares, taking its holding from ~61% to ~77%. IMPORTANT: 77% is the POST-CLOSE figure; the transaction was expected to close in H2 2026 and had not closed as of 2026-07-29, so effectiveFrom is deliberately left blank. Current effective stake at the end of the research window remains ~61%.",
  },
  {
    parentSlug: "digital-realty",
    childSlug: "columbia-capital",
    sourceUrl:
      "https://www.globenewswire.com/news-release/2026/06/22/3315175/0/en/digital-realty-announces-transactions-to-drive-continued-platform-growth.html",
    notes:
      "DIRECTION: Digital Realty is the acquirer/parent. Announced 2026-06-22: Digital Realty agreed to acquire Columbia Capital for ~USD 485m, consideration principally 2.3m DLR common shares with multi-year lockups and a performance earnout. Columbia Capital is an investment firm founded 1989 focused on communications, technology and digital infrastructure, with over USD 9bn in fund commitments, and was a long-standing Teraco investor. ownershipPct omitted: the release does not state a percentage, and it does not spell out whether the perimeter is the management company, the fund interests, or both.",
  },
  {
    parentSlug: "iren",
    childSlug: "ingenostrum",
    sourceUrl: "https://iren.com/resources/news/nostrum-announcement",
    notes:
      "DIRECTION: IREN Limited is the acquirer/parent; Ingenostrum, S.L. (trading as Nostrum Group), a Spanish data centre developer, is the child. Announced 2026-05-07. Adds ~490MW of secured, grid-connected power in Spain plus a development pipeline, taking IREN's power portfolio to 5GW; IREN's first entry into Europe. Consideration and percentage NOT disclosed, so ownershipPct is omitted. The 2026-05-07 release states completion 'remains subject to customary closing conditions'; trade press (StockTitan, DCD) reports completion on 2026-06-15, but I did not fetch a primary confirmation of the closing date, so effectiveFrom is left blank.",
  },
  {
    parentSlug: "arcus-infrastructure-partners",
    childSlug: "volta-data-centres",
    ownershipPct: 100,
    sourceUrl:
      "https://www.verne.co/news/news-arcus-and-verne-announce-agreement-for-arcus-to-acquire-volta-data-centres",
    notes:
      "DIRECTION: Arcus (through Arcus European Infrastructure Fund 4, AEIF4) is the buyer/parent; Volta Data Centres is the child; Verne is the SELLER, not the buyer. Announced 2026-07-02: 'Arcus European Infrastructure Fund 4 has entered into a definitive agreement to acquire 100% of Volta'. Volta is a 6MW carrier-neutral colocation and interconnection facility in central London with 40+ on-site carriers and 1,200+ cross-connects. Financial terms undisclosed. Completion expected in July 2026 but not confirmed by a fetched source, so effectiveFrom is left blank. This is a divestment by Verne (existing operator slug 'verne').",
  },
  {
    parentSlug: "stark-power",
    childSlug: "sagebrush-infrastructure-partners",
    ownershipPct: 100,
    sourceUrl:
      "https://www.prnewswire.com/news-releases/stark-power-to-acquire-sagebrush-infrastructure-partners-securing-5-6-gw-us-data-center-pipeline-302793790.html",
    notes:
      "DIRECTION: Stark Power Ltd. (Tel Aviv Stock Exchange: STRK, incorporated in Israel, formerly EEAMI Ltd) is the acquirer/parent; Sagebrush Infrastructure Partners, LLC (US) is the child. Definitive agreement announced 2026-06-08 to acquire 100%. Brings a ~5.6 GW IT-capacity development pipeline across five Central-US campuses of hyperscale data centres with co-located natural-gas-fired power plants; the only named campus is 'Sagebrush 1' (>1.5 GW IT). Consideration not disclosed; Stark Power separately raised ~NIS 430m (~USD 140m) from Israeli institutional investors. Cross-border structure: Israeli-listed shell-turned-developer acquiring a US LLC development platform.",
  },
  {
    parentSlug: "fluidstack",
    childSlug: "abernathy-joint-venture",
    sourceUrl:
      "https://investors.terawulf.com/news-events/press-releases/detail/142/terawulf-announces-anthropic-lease-at-justified-data-campus-and-sale-of-majority-interest-in-abernathy-joint-venture-to-fluidstack",
    notes:
      "DIRECTION: the buyer is 'an investor group led by Fluidstack, its joint venture partner'; TeraWulf is the SELLER. Announced 2026-07-06: 'TeraWulf will sell its entire 50.1% ownership interest in the Abernathy Joint Venture' for aggregate consideration of ~USD 530m in three instalments (USD 250m within 14 days of execution, USD 150m by 2026-12-31, ~USD 130m by 2027-04-30), monetising a ~USD 450m investment. The JV was formed in 2025 to develop a 168 MW critical-IT-load AI data centre campus in Abernathy, Texas; Fluidstack held the other 49.9%. NOTE ON INSTRUMENT: this IS an equity transfer (sale of a 50.1% membership interest in the JV entity), not merely a JV formation — but ownershipPct is deliberately omitted because the release attributes the purchase to an unnamed 'investor group led by Fluidstack', so assigning 50.1% (or 100%) to Fluidstack alone would not be supported. effectiveFrom left blank: definitive agreement, closing not confirmed.",
  },
  {
    parentSlug: "soluna",
    childSlug: "project-dorothy-1b",
    ownershipPct: 100,
    effectiveFrom: "2026-05-20",
    sourceUrl: "https://www.solunacomputing.com/news/d1b-acquisition/",
    notes:
      "DIRECTION: Soluna Holdings, Inc. is the acquirer/parent; Project Dorothy 1B is the child entity. Announced 2026-05-20: Soluna acquired the remaining 49% equity interest in Project Dorothy 1B from Navitas Global (Navitas West Texas Investments) for USD 8,765,490, taking Soluna to 100% equity ownership. D1B is a 25MW facility in Silverton, Texas; combined with D1A this gives Soluna 100% of both facilities (50 MW total) on the Dorothy 1 campus alongside the 150 MW Briscoe Wind Farm.",
  },
  {
    parentSlug: "nextera-energy",
    childSlug: "dominion-energy",
    sourceUrl:
      "https://www.prnewswire.com/news-releases/nextera-energy-and-dominion-energy-to-combine-creating-the-worlds-largest-regulated-electric-utility-business-and-north-americas-premier-energy-infrastructure-platform-benefiting-customers-302774600.html",
    notes:
      "DIRECTION VERIFIED — NextEra Energy is the ACQUIRER, Dominion Energy is the ACQUIRED. The release is headlined as a 'combination', which is the exact phrasing that invites an inverted record. Evidence of direction: 'Dominion Energy shareholders will receive a fixed exchange ratio of 0.8138 shares of NextEra Energy for each share of Dominion Energy they own at the close'; NextEra shareholders hold ~74.5% and Dominion shareholders ~25.5% of the combined company; the combined company operates under the NextEra Energy name. Announced 2026-05-18, all-stock, expected to close in 12-18 months subject to regulatory approvals, so effectiveFrom is left blank and ownershipPct is omitted. Relevance to this dataset: 'dominion-energy' is an existing utility slug and is the interconnecting utility for large Virginia datacentre load; Dominion customers are to receive USD 2.25bn in bill credits over two years.",
  },
  {
    parentSlug: "swi-group",
    childSlug: "genesis-digital-assets",
    sourceUrl: "https://swi.com/wp-content/uploads/Press-Release-2.2-final.pdf",
    notes:
      "DIRECTION: SWI Group (SWI Stoneweg Icona Group, Euronext Amsterdam: SWICH) is the parent; Genesis Digital Assets Limited ('GDA') is the child. Press release dated 2026-06-15: 'binding agreement to acquire an additional shareholding in Genesis Digital Assets Limited', which 'will increase SWI Group's shareholding ... to majority holding position'. This is an increase from an existing minority to a majority; no before/after percentages are disclosed, so ownershipPct is omitted. GDA holds over 1.3 GW of energized and approved grid connections across 15 facilities located primarily in the United States and Sweden, including multiple hyperscaler-grade sites in Texas. JURISDICTION FLAG: GDA's country of incorporation is not stated anywhere in the release; the 'Limited' suffix plus an undisclosed domicile for a 1.3 GW US/Swedish portfolio is the kind of opaque holding structure this hub flags.",
  },
  {
    parentSlug: "swi-group",
    childSlug: "polarise",
    sourceUrl: "https://swi.com/wp-content/uploads/Press-Release-2.2-final.pdf",
    notes:
      "DIRECTION: SWI Group is the parent; Polarise GmbH (Germany) is the child. Same 2026-06-15 release: 'SWI Group has also agreed to acquire a majority stake in Polarise'. Percentage not disclosed, so ownershipPct is omitted; agreement only, so effectiveFrom is left blank. Polarise is a German AI/HPC infrastructure platform, an official NVIDIA Cloud Service Provider, and launched the first industrial-scale AI Factory in Germany in partnership with Deutsche Telekom and NVIDIA. The Deutsche Telekom/NVIDIA relationship is a PARTNERSHIP, not an equity holding, and is deliberately not recorded as an ownership edge.",
  },
  {
    parentSlug: "swi-group",
    childSlug: "aionx",
    ownershipPct: 100,
    sourceUrl: "https://swi.com/wp-content/uploads/Press-Release-2.2-final.pdf",
    notes:
      "DIRECTION: SWI Group is the parent; AiOnX is the wholly owned child. The 2026-06-15 release states: 'AiOnX is SWI Group's wholly owned data center development and operating platform, with five sites under development across Ireland, the United Kingdom, Denmark, Spain, and Italy, representing 2.3 GW of European AI-ready capacity.' CAVEAT: this relationship is disclosed inside the research window but is not itself new — the release describes an existing structure rather than announcing a transaction.",
  },
  {
    parentSlug: "apleona",
    childSlug: "sygna",
    sourceUrl: "https://apleona.com/en/about-apleona/news-stories/newsroom/",
    effectiveFrom: "2026-07-07",
    notes:
      "DIRECTION: Apleona is the acquirer/parent; Sygna is the child. Apleona newsroom item dated 2026-07-07: 'Apleona has acquired a majority stake in Sygna, an international specialist in the commissioning of data centres.' Percentage not disclosed, so ownershipPct is omitted. UNVERIFIED DETAIL: trade-press and law-firm snippets (DMH Stallard, property-magazine.eu, LinkedIn) give the target's full name as Sygna Holdings Limited, headquartered in Canary Wharf, London, with completion on 2026-07-01 and existing shareholders retaining a significant minority — I did not fetch those pages, so the legal name, UK jurisdiction and 2026-07-01 completion date are NOT recorded as fact here. Apleona is reported to be Bain Capital-backed and German-headquartered; that was also not verified from a fetched page. Vertical-integration angle: an FM services group buying a data-centre commissioning contractor.",
  },
  {
    parentSlug: "i-squared-capital",
    childSlug: "elea-data-centers",
    sourceUrl:
      "https://isquaredcapital.com/news/latam-expansion-elea-data-centers-acquisition/",
    effectiveFrom: "2026-04-28",
    notes:
      "DIRECTION: I Squared Capital is the acquirer/parent; Elea Data Centers (Brazil) is the child. Announced 2026-04-28 (the first day of the research window). Elea operates nine interconnected data centre campuses across Brazil including Sao Paulo, Rio de Janeiro and Brasilia, with over 300MW of powered land and over 1GW in development, plus the 3GW Rio AI City project requiring more than USD 10bn of capital. DISPUTE FLAGGED: I Squared's own release says only that it 'has agreed to acquire Elea Data Centers' and does not state a percentage; DCD and idcnova describe it as a MAJORITY stake. ownershipPct is therefore omitted. Co-investor: Piemonte Holding, described as 'a long-term partner of the platform', continues alongside; Elea's founder-led management team stays. Seller not disclosed.",
  },
  {
    parentSlug: "hive-digital",
    childSlug: "buzz-hpc",
    sourceUrl:
      "https://www.hivedigitaltechnologies.com/news/hives-buzz-hpc-announces-320-mw-sovereign-ai-infrastructure-in-greater-toronto-area/",
    notes:
      "BUZZ HPC is a subsidiary of HIVE Digital Technologies; both agents state this independently.",
  },
];

export const REFRESH_2026_07_SUPPLIERS: SeedSupplier[] = [
  {
    datacenterSlug: "hut8-beacon-point-nueces-tx",
    supplierSlug: "jacobs",
    category: "gc",
    role: "Sole-source EPCM (engineering, procurement and construction management) for phased delivery of Hut 8's 1 GW Beacon Point AI data center campus; scope covers design, integrated procurement and construction management, plus deployment of Jacobs' data center digital twin technology to simulate critical assets. Initial energization and commissioning targeted for 2027.",
    sources: [
      {
        url: "https://www.jacobs.com/newsroom/press-release/jacobs-awarded-epcm-contract-deliver-second-hut-8-ai-data-center-texas",
        title:
          "Jacobs Awarded EPCM Contract to Deliver Second Hut 8 AI Data Center in Texas",
        type: "pr",
        publishedAt: "2026-05-12",
      },
    ],
  },
  {
    datacenterSlug: "greenlight-electricity-centre-sturgeon-county-ab",
    supplierSlug: "aecon",
    category: "civil",
    role: "Civil works for existing and future power islands, plus piping, mechanical, structural, electrical and instrumentation work for the balance of plant, gas metering station, switchyard and substation at the 932 MW (expandable to 1,864 MW) Greenlight Electricity Centre, which will supply electricity to a co-located data centre. Delivered through a consortium with Tecnicas Reunidas Alberta in which Aecon holds the majority share. Construction to start Q3 2026, completion anticipated 2030. Aecon's share of the multibillion-dollar contract is stated as $1.7 billion, but the release does not state the currency and Aecon reports in Canadian dollars, so contractValueUsd is deliberately not populated. Owner: Greenlight Electricity Centre Limited Partnership (Pembina Pipeline Corporation, Morgan Stanley Infrastructure Partners, Kineticor Asset Management).",
    sources: [
      {
        url: "https://www.aecon.com/press-room/news/2026/07/02/greenlight-energy-centre",
        title:
          "Aecon consortium awarded Greenlight Electricity Centre contract",
        type: "pr",
        publishedAt: "2026-07-02",
      },
    ],
  },
  {
    datacenterSlug: "greenlight-electricity-centre-sturgeon-county-ab",
    supplierSlug: "tecnicas-reunidas",
    category: "civil",
    role: "Consortium partner with Aecon (Aecon holds the majority share of the Tecnicas Reunidas Alberta consortium) on the Greenlight Electricity Centre EPC scope in Sturgeon County, Alberta. Contract value for this party alone is not disclosed.",
    sources: [
      {
        url: "https://www.aecon.com/press-room/news/2026/07/02/greenlight-energy-centre",
        title:
          "Aecon consortium awarded Greenlight Electricity Centre contract",
        type: "pr",
        publishedAt: "2026-07-02",
      },
    ],
  },
  {
    datacenterSlug: "circe-energy-west-texas-tx",
    supplierSlug: "cummins",
    category: "backup-power",
    role: "Supply of high-power natural gas generator sets — HSK78 (C2000N6CD) and QSK60 (C1400N6) platforms — with integrated microgrid controls for Circe Energy's behind-the-meter prime-power microgrid serving its HPC/AI data center campus in West Texas. Deliveries scheduled 2026 through 2030. Total MW and contract value not disclosed.",
    sources: [
      {
        url: "https://investor.cummins.com/news/detail/697/cummins-natural-gas-generators-to-power-large-scale-data",
        title:
          "Cummins Natural Gas Generators to Power Large Scale Data Centers in West Texas",
        type: "pr",
        publishedAt: "2026-06-16",
      },
    ],
  },
];
