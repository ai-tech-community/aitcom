/**
 * AI datacenter investigation refresh — checked 2026-11-03.
 *
 * Only claims that a source fetched that day still states. PowerBank's
 * Ontario 2 MW project is absent: the announcement names no town, and both
 * the seed type and the datacenter table require a latitude and longitude.
 * NAVER Sejong is absent; `naver-sejong-gak` in apac.ts is left as it is.
 * Project Dorothy 3 is a new site. It does not reuse the `project-dorothy-1b`
 * brand.
 */

import type { SeedDatacenter, SeedBrand } from "./types";
import type { SeedPermit } from "./permits";

export const REFRESH_2026_11_BRANDS: SeedBrand[] = [
  {
    slug: "everwind",
    canonicalName: "EverWind",
    website: "https://everwinddc.com/",
  },
  {
    slug: "soluna-applied-dorothy-3",
    canonicalName: "Soluna and Applied Digital project company",
  },
  {
    slug: "kmg",
    canonicalName: "KMG",
  },
  {
    slug: "prometheus-hyperscale",
    canonicalName: "Prometheus Hyperscale",
  },
  {
    slug: "pnk-group",
    canonicalName: "PNK Group",
  },
  {
    slug: "revikon",
    canonicalName: "Revikon",
  },
];

export const REFRESH_2026_11_DATACENTERS: SeedDatacenter[] = [
  {
    slug: "everwind-point-tupper",
    name: "EverWind Point Tupper data centre campus",
    operatorSlug: "everwind",
    status: "announced",
    aiDedicated: true,
    lat: 45.6044,
    lng: -61.3675,
    city: "Point Tupper",
    region: "NS",
    country: "CA",
    capacityMwPlanned: 420,
    primaryPowerSource: "hybrid",
    coolingType: "closed-loop",
    description:
      "EverWind announced on 16 October 2026 a data centre campus at its existing Point Tupper industrial site. The release describes a 95 MW phase targeted for late 2027 and a 325 MW expansion targeted for 2028, 420 MW at full build-out, with more than $8 billion for the campus and $2 billion for onshore wind. It does not name the currency. The expansion is subject to further studies and approvals. EverWind's project site says the full 420 MW campus is not approved, and that the phase-1 IESO Nova Scotia system impact study and Nova Scotia Power facilities study are complete. CBC News reported that Anthropic will lease the first phase for at least 20 years to power Claude, and described the work as pre-construction with land clearing underway. The release says the campus will use a closed-loop water-glycol cooling system. The project site says the campus is served from the Nova Scotia grid at first, with EverWind's wind projects intended to supply the majority once they are operating, plus battery storage. Coordinates are the published community point for Point Tupper (45°36′16″N 61°22′03″W), not the industrial-park parcel.",
    sources: [
      {
        url: "https://www.globenewswire.com/news-release/2026/10/16/3382650/0/en/everwind-announces-10-billion-investment-in-point-tupper-data-centre-campus-and-renewable-energy-portfolio-across-nova-scotia.html",
        title:
          "EverWind Announces $10 billion Investment in Point Tupper Data Centre Campus and Renewable Energy Portfolio Across Nova Scotia",
        type: "pr",
        publishedAt: "2026-10-16",
      },
      {
        url: "https://www.cbc.ca/news/canada/nova-scotia/nova-scotia-to-host-massive-data-centre-to-power-anthropic-s-ai-assistant-claude-9.7383129",
        title:
          "Nova Scotia to host massive data centre to power Anthropic's AI assistant Claude",
        type: "news",
        publishedAt: "2026-10-16",
      },
      {
        url: "https://everwinddc.com/",
        title: "EverWind Point Tupper data centre campus",
        type: "operator",
      },
      {
        url: "https://en.wikipedia.org/wiki/Point_Tupper",
        title: "Point Tupper (community coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "project-dorothy-3",
    name: "Project Dorothy 3",
    operatorSlug: "soluna-applied-dorothy-3",
    status: "announced",
    aiDedicated: true,
    lat: 34.471256,
    lng: -101.304749,
    city: "Silverton",
    region: "TX",
    country: "US",
    capacityMwPlanned: 50,
    primaryPowerSource: "hybrid",
    description:
      "On 21 October 2026 Soluna Holdings announced a definitive agreement with Applied Digital to form a project company for a 50 MW critical-IT data center for AI and HPC at Project Dorothy 3, Soluna's development site near Silverton in Briscoe County, Texas, co-located with the Briscoe Wind Farm. Soluna's release says the farm is 150 MW and that phase 1 is expected to draw power from the wind farm and the grid. After closing, Applied is expected to hold 51 percent and Soluna 49 percent. Closing is expected by the end of 2026 and is subject to conditions, including approval of a Briscoe County tax abatement. ChronoScale has signed a non-binding letter of intent to lease the facility. Soluna's Form 8-K of the same day furnishes that announcement. DCD reported on 22 October 2026 that the site could total 300 MW at full build-out. That figure is not in the Soluna release or the 8-K, and it is not stored as capacity. Coordinates are the city point printed for Silverton, Texas (34.471256, -101.304749), not the development site.",
    sources: [
      {
        url: "https://www.solunacomputing.com/news/soluna-applied-digital-chronoscale/",
        title:
          "Soluna Agrees to Form Strategic Partnership with Applied Digital to Develop Wind-Powered AI Data Center in Texas",
        type: "pr",
        publishedAt: "2026-10-21",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/64463/000149315226047846/form8-k.htm",
        title: "Soluna Holdings, Inc. Form 8-K",
        type: "filing",
        publishedAt: "2026-10-21",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/soluna-and-applied-digital-to-build-50mw-data-center-in-texas/",
        title: "Soluna and Applied Digital to build 50MW data center in Texas",
        type: "news",
        publishedAt: "2026-10-22",
      },
      {
        url: "https://en.wikipedia.org/wiki/Silverton,_Texas",
        title: "Silverton, Texas (city coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "kmg-jakarta",
    name: "KMG Jakarta AI data center",
    operatorSlug: "kmg",
    status: "operational",
    aiDedicated: true,
    lat: -6.18,
    lng: 106.83,
    city: "Jakarta",
    country: "ID",
    capacityMw: 30,
    capacityMwPlanned: 400,
    coolingType: "air",
    description:
      "LG CNS completed a 30 MW hyperscale AI data center in Jakarta for KMG, a joint venture of Sinar Mas Group and Korea Investment Real Asset Management. JoongAng Daily reported an opening ceremony on 1 November 2026. The Korea Times reported on 2 November 2026 that customers had been secured for the full capacity before construction finished, that the first phase uses air cooling with liquid cooling planned for later phases, and that LG CNS is designing a next phase to raise total power capacity to 400 MW. JoongAng Daily said capacity could reach up to 400 MW. Neither article gives a street address. Coordinates are Wikipedia's published city point for Jakarta, to the 0.01 degree precision on that page, not a parcel.",
    sources: [
      {
        url: "https://www.koreatimes.co.kr/business/companies/20261102/lg-cns-completes-30-mw-ai-data-center-in-indonesia",
        title: "LG CNS completes 30-MW AI data center in Indonesia",
        type: "news",
        publishedAt: "2026-11-02",
      },
      {
        url: "https://www.koreajoongangdaily.com/business/lg-cns-completes-construction-of-ai-data-center-in-indonesia/12950280",
        title: "LG CNS completes construction of AI data center in Indonesia",
        type: "news",
        publishedAt: "2026-11-02",
      },
      {
        url: "https://en.wikipedia.org/wiki/Jakarta",
        title: "Jakarta (city coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "prometheus-casper",
    name: "Prometheus Hyperscale Casper",
    operatorSlug: "prometheus-hyperscale",
    status: "cancelled",
    aiDedicated: true,
    lat: 42.8403,
    lng: -106.3181,
    city: "Casper",
    region: "WY",
    country: "US",
    capacityMwPlanned: 1250,
    description:
      "Prometheus Hyperscale told WyoFile that it will not pursue a 1,250 MW, $500 million artificial-intelligence computing complex in Natrona or Converse counties. The article, dated 28 October 2026, says the company announced the decision that Wednesday and had reconfigured the proposal to rural Natrona County east of Casper. Commissioner Dave North told WyoFile the talks had not reached a permit or zoning application. The company said it is still pursuing its data center project in Evanston, Uinta County. Coordinates are the published city point for Casper (42°50′25″N 106°19′05″W), not the rural site east of town.",
    sources: [
      {
        url: "https://wyofile.com/prometheus-cancels-data-center-proposal-near-casper/",
        title: "Prometheus cancels data center proposal near Casper",
        type: "news",
        publishedAt: "2026-10-28",
      },
      {
        url: "https://en.wikipedia.org/wiki/Casper,_Wyoming",
        title: "Casper, Wyoming (city coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "aws-bridgefield-ashburn",
    name: "Bridgefield Tech Center",
    operatorSlug: "aws",
    status: "cancelled",
    aiDedicated: false,
    lat: 39.0584,
    lng: -77.4432,
    city: "Ashburn",
    region: "VA",
    country: "US",
    description:
      "Amazon agreed to withdraw its application for the Bridgefield Tech Center, a four-building data center campus of 800,000 sq ft (74,320 sq m) on the 122-acre George Washington University Virginia Science and Technology Campus in Ashburn. DCD reported the agreement on 21 October 2026. The article says Amazon Data Services acquired the campus from the university in March for $427 million on a five-year sale-leaseback. Under the agreement Amazon will dedicate roughly 25 acres for a community arts centre and indoor sports facility, has committed to rezone the remainder for housing and mixed use, and has made a $5 million donation to the county housing fund. The article does not state the year of the March acquisition and does not state a capacity in megawatts. The Loudoun Times-Mirror's public page, dated 25 October 2026, says Amazon has formally withdrawn the application for that campus, north of Ashburn. Its article body is subscriber-only and was not used. The Washington Post reported on 22 October 2026 that Amazon cancelled the plan and will repurpose the majority of the 122-acre Ashburn property for mixed-use and residential development. None of these pages states the withdrawal filing date. Coordinates are the published point for the Virginia Science and Technology Campus (39°3′30.3″N 77°26′35.5″W), not a corner of a proposed building.",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/amazon-withdraws-application-for-data-center-campus-at-gwu-site-in-ashburn-virginia/",
        title:
          "Amazon withdraws application for data center campus at GWU site in Ashburn, Virginia",
        type: "news",
        publishedAt: "2026-10-21",
      },
      {
        url: "https://www.loudountimes.com/news/business_and_economy/real_estate_and_development/amazon-formally-withdraws-data-center-application-at-gwu-campus/article_779d255c-1d3c-46eb-956d-1d2f2ad7cf79.html",
        title:
          "Amazon formally withdraws data center application at GWU campus",
        type: "news",
        publishedAt: "2026-10-25",
      },
      {
        url: "https://www.washingtonpost.com/dc-md-va/2026/10/22/amazon-wont-build-data-centers-loudoun-county-deal-with-local-leaders/",
        title:
          "Amazon cancels plan for data centers in Loudoun County, donates land",
        type: "news",
        publishedAt: "2026-10-22",
      },
      {
        url: "https://en.wikipedia.org/wiki/George_Washington_University_Virginia_Science_and_Technology_Campus",
        title:
          "George Washington University Virginia Science and Technology Campus (campus coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "aws-iver-ridgeway",
    name: "AWS Iver (Ridgeway Distribution Centre)",
    operatorSlug: "aws",
    status: "announced",
    aiDedicated: false,
    lat: 51.521,
    lng: -0.507,
    city: "Iver",
    region: "Buckinghamshire",
    country: "GB",
    description:
      "DCD reported on 1 October 2026 that Buckinghamshire Council had granted planning permission for an Amazon Data Services data center at the Ridgeway Distribution Centre in Iver. The article describes one two-storey data center building on a 30,525 sq m campus, a substation compound, and 27 backup generators. Amazon is to pay £600,382 toward air-quality offsets and £73,000 toward improving public rights of way, and must still submit information on construction traffic, drainage, and water use. No capacity in megawatts is stated. The article says Amazon Data Services filed in October 2025 and bought the site in 2022 for £132.5 million. It does not print a separate decision date. This is not the Corscale Court Lane campus. Coordinates are the published village point for Iver (51.521, -0.507), not the distribution-centre parcel.",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/aws-granted-planning-permission-for-data-center-in-iver-uk/",
        title: "AWS granted planning permission for data center in Iver, UK",
        type: "news",
        publishedAt: "2026-10-01",
      },
      {
        url: "https://en.wikipedia.org/wiki/Iver",
        title: "Iver (village coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "goodman-project-apollo-macquarie-park",
    name: "Goodman Project Apollo",
    operatorSlug: "goodman-group",
    status: "announced",
    aiDedicated: false,
    lat: -33.7772,
    lng: 151.12412,
    city: "Macquarie Park",
    region: "NSW",
    country: "AU",
    capacityMwPlanned: 135,
    primaryPowerSource: "grid-mixed",
    description:
      "DCD reported on 7 September 2026 that the NSW Department of Planning, Housing and Infrastructure had granted planning permission for Goodman Group's 135 MW Project Apollo at 4-10 Talavera Road, Macquarie Park, following a meeting last week. The article states a cost of AU$1.4 billion, eight data halls, grid power, evaporative cooling towers, backup diesel generators and lithium-ion batteries, and up to 60 permanent jobs. Goodman filed for the site in 2024. The article does not give the decision day. The NSW planning portal record was not fetched. Coordinates are the published suburb point for Macquarie Park (-33.77720, 151.12412), not the Talavera Road parcel.",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/goodman-group-gets-green-light-for-135mw-data-center-in-northern-sydney-australia/",
        title:
          "Goodman Group gets green light for 135MW data center in northern Sydney, Australia",
        type: "news",
        publishedAt: "2026-09-07",
      },
      {
        url: "https://en.wikipedia.org/wiki/Macquarie_Park",
        title: "Macquarie Park (suburb coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "revikon-giessen",
    name: "Revikon Gießen (Katzenfeld)",
    operatorSlug: "revikon",
    status: "announced",
    aiDedicated: false,
    lat: 50.5833,
    lng: 8.6667,
    city: "Gießen",
    region: "Hesse",
    country: "DE",
    capacityMwPlanned: 65,
    description:
      "DCD reported on 4 September 2026 that municipal authorities in Hesse had approved a Revikon data center in Gießen, with 38 of 57 council members voting in favour. The article states a connected load of up to 65 MW, a cost of more than €1 billion, 200 permanent jobs, and a facility occupying six hectares on a 16.75-hectare plot at Katzenfeld, west of town. It says construction is scheduled to start toward the end of this year, and that the facility's operator has not been chosen. It does not give the sitting date or name a building-permit instrument. No published point for Katzenfeld was found. Coordinates are the published city point for Gießen (50°35′N 8°40′E), not the plot.",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/data-center-proposal-approved-by-local-council-in-suburb-of-frankfurt-germany/",
        title:
          "Data center proposal approved by local council in suburb of Frankfurt, Germany",
        type: "news",
        publishedAt: "2026-09-04",
      },
      {
        url: "https://en.wikipedia.org/wiki/Giessen",
        title: "Giessen (city coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "pnk-wisconsin-rapids",
    name: "PNK Wisconsin Rapids",
    operatorSlug: "pnk-group",
    status: "cancelled",
    aiDedicated: false,
    lat: 44.3835763,
    lng: -89.8173466,
    city: "Wisconsin Rapids",
    region: "WI",
    country: "US",
    description:
      "WAOW reported that the Wisconsin Rapids Common Council voted 7-0 on the night of 20 October 2026 to reject a conditional use permit for a PNK Group hyperscale data center at the former paper mill site. The article, dated 20 October 2026, says that on 9 October the city entered a one-year data center moratorium, with an option to extend it to 18 months. No capacity in megawatts is stated. Coordinates are the city point printed for Wisconsin Rapids (44.3835763, -89.8173466), not the mill parcel.",
    sources: [
      {
        url: "https://www.waow.com/news/wisconsin-rapids-rejects-permit-for-proposed-data-center/article_7122e983-fbd2-47f0-b72f-a276929efc67.html",
        title: "Wisconsin Rapids rejects permit for proposed data center",
        type: "news",
        publishedAt: "2026-10-20",
      },
      {
        url: "https://en.wikipedia.org/wiki/Wisconsin_Rapids,_Wisconsin",
        title: "Wisconsin Rapids, Wisconsin (city coordinates)",
        type: "other",
      },
    ],
  },
];

export const REFRESH_2026_11_PERMITS: SeedPermit[] = [
  {
    datacenterSlug: "aws-bridgefield-ashburn",
    kind: "zoning",
    issuingBody: "Loudoun County",
    status: "withdrawn",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/amazon-withdraws-application-for-data-center-campus-at-gwu-site-in-ashburn-virginia/",
        title:
          "Amazon withdraws application for data center campus at GWU site in Ashburn, Virginia",
        type: "news",
        publishedAt: "2026-10-21",
      },
      {
        url: "https://www.loudountimes.com/news/business_and_economy/real_estate_and_development/amazon-formally-withdraws-data-center-application-at-gwu-campus/article_779d255c-1d3c-46eb-956d-1d2f2ad7cf79.html",
        title:
          "Amazon formally withdraws data center application at GWU campus",
        type: "news",
        publishedAt: "2026-10-25",
      },
    ],
    notes:
      "The datacenter row uses status cancelled because the facility status enum has no withdrawn value. This permit uses the existing permit status withdrawn. No issuedDate is stored. DCD's 21 October 2026 article describes the agreement to withdraw and does not give a filing date. The Loudoun Times-Mirror public page of 25 October 2026 says the application was formally withdrawn. Its article body is subscriber-only and was not used, so a 20 October filing date was not confirmed. No megawatt figure is stated.",
  },
  {
    datacenterSlug: "aws-iver-ridgeway",
    kind: "zoning",
    issuingBody: "Buckinghamshire Council",
    issuedDate: "2026-10-01",
    status: "granted",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/aws-granted-planning-permission-for-data-center-in-iver-uk/",
        title: "AWS granted planning permission for data center in Iver, UK",
        type: "news",
        publishedAt: "2026-10-01",
      },
    ],
    notes:
      "issuedDate is the date DCD reported the grant. The article does not print a separate decision-instrument date. Amazon must still submit information on construction traffic, drainage, and water use. No megawatt figure is stated.",
  },
  {
    datacenterSlug: "goodman-project-apollo-macquarie-park",
    kind: "zoning",
    issuingBody: "NSW Department of Planning, Housing and Infrastructure",
    status: "granted",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/goodman-group-gets-green-light-for-135mw-data-center-in-northern-sydney-australia/",
        title:
          "Goodman Group gets green light for 135MW data center in northern Sydney, Australia",
        type: "news",
        publishedAt: "2026-09-07",
      },
    ],
    notes:
      "No issuedDate is stored. DCD says the department granted permission following a meeting last week, relative to its 7 September 2026 article, and does not give the day. The NSW planning portal record was not fetched.",
  },
  {
    datacenterSlug: "revikon-giessen",
    kind: "other",
    issuingBody: "Gießen council",
    status: "granted",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/data-center-proposal-approved-by-local-council-in-suburb-of-frankfurt-germany/",
        title:
          "Data center proposal approved by local council in suburb of Frankfurt, Germany",
        type: "news",
        publishedAt: "2026-09-04",
      },
    ],
    notes:
      "Kind is other because DCD reports a council vote approving the project and does not name a building permit or development-plan instrument. Status granted is the existing permit value for an approval. No issuedDate is stored: the article says 38 of 57 members voted in favour and does not give the sitting date. The facility operator has not been chosen.",
  },
  {
    datacenterSlug: "pnk-wisconsin-rapids",
    kind: "zoning",
    issuingBody: "Wisconsin Rapids Common Council",
    issuedDate: "2026-10-20",
    status: "denied",
    sources: [
      {
        url: "https://www.waow.com/news/wisconsin-rapids-rejects-permit-for-proposed-data-center/article_7122e983-fbd2-47f0-b72f-a276929efc67.html",
        title: "Wisconsin Rapids rejects permit for proposed data center",
        type: "news",
        publishedAt: "2026-10-20",
      },
    ],
    notes:
      "The datacenter row uses status cancelled because the facility status enum has no refused value. This permit uses the existing permit status denied. issuedDate is the date of WAOW's report, which says the council voted 7-0 on Tuesday night to reject the conditional use permit. 20 October 2026 was that Tuesday. No megawatt figure is stated. The one-year moratorium that began on 9 October is a city policy, not a second permit.",
  },
];
