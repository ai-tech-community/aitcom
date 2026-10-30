/**
 * AI datacenter investigation refresh — checked 2026-10-29.
 *
 * Only the items the 29 Oct brief confirmed against a primary page fetched
 * that day. NAVER Sejong and Soluna Dorothy 3 are intentionally absent.
 *
 * Skellefteå DC01/DC02 is intentionally absent. Skellefteå kommun's notice
 * for case 2026-3140 grants a building permit for datacenter DC02 and a
 * change of use of DS4 and FA03 to DC01 on Ackumulatorn 3, but it does not
 * name an applicant or operator:
 * https://skelleftea.se/download/18.37dfe2e81a0adc9019bf50f/1790595282269/2026-09-28_SAM-2026-3140_96_Kung%C3%B6relse.pdf
 *
 * Google Grange Castle is not restated here. The campus already exists as
 * `google-dublin-grange-castle` in eu.ts; restating it would be dropped by
 * slug dedupe. The status change lives on that row, and the permit is below.
 */

import type { SeedDatacenter, SeedBrand } from "./types";
import type { SeedPermit } from "./permits";

export const REFRESH_2026_10_BRANDS: SeedBrand[] = [
  {
    slug: "crag-rathnew-dc",
    canonicalName: "Crag Rathnew DC Limited",
  },
  {
    slug: "uniq-land",
    canonicalName: "Uniq Land",
  },
  {
    slug: "x2m-connect",
    canonicalName: "X2M Connect Limited",
    website: "https://www.x2mconnect.com",
  },
];

export const REFRESH_2026_10_DATACENTERS: SeedDatacenter[] = [
  {
    slug: "kilmeaden-waterford",
    name: "Kilmeaden data centre and energy development",
    operatorSlug: "crag-rathnew-dc",
    status: "cancelled",
    aiDedicated: false,
    lat: 52.2342,
    lng: -7.2436,
    city: "Kilmeaden",
    region: "Waterford",
    country: "IE",
    primaryPowerSource: "hybrid",
    description:
      "Waterford City and County Council refused planning permission on 15 October 2026 for a data centre and energy development on the former Kilmeaden cheese factory site and adjoining lands, 108.79 hectares in all. The applicants were Crag Rathnew DC Limited and Kent Homes Limited. The application described a mixed-use village centre, technology park and renewable energy development, including three ICT buildings of about 24,000 square metres each, an energy centre with 16 gas-powered turbines, a solar farm of more than 43,000 panels and a battery storage system. No capacity in megawatts was stated. Coordinates are the published village point for Kilmeaden, not the application boundary.",
    sources: [
      {
        url: "https://www.rte.ie/news/regional/2026/1015/1595561-data-centre-waterford/",
        title:
          "Planning permission for major data centre development in Co Waterford refused",
        type: "news",
        publishedAt: "2026-10-15",
      },
      {
        url: "https://en.wikipedia.org/wiki/Kilmeaden",
        title: "Kilmeaden (village coordinates)",
        type: "other",
      },
    ],
  },
  {
    slug: "langenhorn-sh",
    name: "Langenhorn data center",
    operatorSlug: "uniq-land",
    status: "announced",
    aiDedicated: false,
    lat: 54.6667,
    lng: 8.9167,
    city: "Langenhorn",
    region: "Schleswig-Holstein",
    country: "DE",
    capacityMwPlanned: 150,
    primaryPowerSource: "wind",
    coolingType: "closed-loop",
    description:
      "The municipal council of Langenhorn in Schleswig-Holstein voted on 26 August 2026 to continue pursuing a data centre with up to 150 MW of connected load, proposed by Uniq Land and Erschließungsgesellschaft Nordfriesland (EG.NF). Uniq Land has applied to build in the district of Mönkebüll; the municipality reserved the right to consider other sites in the area. Construction is set to begin in March 2028 at the earliest. A further rise in connection capacity to 300 MW is described as contingent on upgrades to the regional grid. Cooling is a waterless closed-loop system, with waste-heat reuse planned, and power is planned from regional wind farms. Coordinates are the published municipality point, not a parcel.",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/data-center-in-langenhorn-germany-receives-provisional-approval-from-municipal-authorities/",
        title:
          "Data center in Langenhorn, Germany, receives provisional approval from municipal authorities",
        type: "news",
        publishedAt: "2026-10-16",
      },
      {
        url: "https://en.wikipedia.org/wiki/Langenhorn_(Nordfriesland)",
        title: "Langenhorn (Nordfriesland) municipality coordinates",
        type: "other",
      },
    ],
  },
  {
    slug: "x2m-queensland-10mw",
    name: "X2M Queensland 10 MW AI data centre",
    operatorSlug: "x2m-connect",
    status: "announced",
    aiDedicated: true,
    lat: -22.4869,
    lng: 144.4317,
    region: "QLD",
    country: "AU",
    capacityMwPlanned: 10,
    primaryPowerSource: "hybrid",
    description:
      "X2M Connect Limited announced on 23 October 2026 a binding exclusivity agreement with an unnamed Queensland developer for a 10 MW AI-enabled data centre site that already has local government development approval. Exclusivity over the site and its power runs for 60 days, with binding long-form agreements targeted within 90 days. The site has a 2.5 MW grid connection; the developer is to build behind-the-meter renewable generation for a further 7.5 MW under a power purchase agreement, expected by the end of 2028. The estimated project cost is A$250 million. The announcement does not name the town or the developer. Coordinates are Geoscience Australia's published geographical centre of Queensland (17 km north-west of Muttaburra), not the site.",
    sources: [
      {
        url: "https://www.marketindex.com.au/data-api/api/v1/announcements/XASX:X2M:3A704751/pdf/inline/signs-binding-agreement-to-deliver-aienabled-data-centre",
        title:
          "X2M Signs Agreement for 10MW AI-Enabled Data Centre (ASX announcement, 23 October 2026)",
        type: "filing",
        publishedAt: "2026-10-23",
      },
      {
        url: "https://www.ga.gov.au/scientific-topics/national-location-information/dimensions/centre-of-australia-states-territories",
        title: "Geoscience Australia: Centre of Queensland (map point only)",
        type: "other",
      },
    ],
  },
];

export const REFRESH_2026_10_PERMITS: SeedPermit[] = [
  {
    datacenterSlug: "google-dublin-grange-castle",
    kind: "zoning",
    issuingBody: "An Coimisiún Pleanála",
    issuedDate: "2026-09-28",
    status: "granted",
    sources: [
      {
        url: "https://www.irishtimes.com/business/2026/09/28/google-wins-planning-permission-for-dublin-data-centre-extension/",
        title:
          "Google wins planning permission for Dublin data centre extension",
        type: "news",
        publishedAt: "2026-09-28",
      },
    ],
    notes:
      "issuedDate is the date The Irish Times reported the grant. The article does not print a separate decision-instrument date. An Coimisiún Pleanála granted permission for a 72,400 square metre third-phase extension on the 50-acre Grange Castle site, overturning South Dublin County Council's August 2024 refusal. Conditions include evidence of engagement with power purchase agreements before development starts, and renewable fuel for the backup generators. The report says the decision may still be subject to judicial review. No new megawatt figure is stated.",
  },
  {
    datacenterSlug: "kilmeaden-waterford",
    kind: "zoning",
    issuingBody: "Waterford City and County Council",
    issuedDate: "2026-10-15",
    status: "denied",
    sources: [
      {
        url: "https://www.rte.ie/news/regional/2026/1015/1595561-data-centre-waterford/",
        title:
          "Planning permission for major data centre development in Co Waterford refused",
        type: "news",
        publishedAt: "2026-10-15",
      },
    ],
    notes:
      "issuedDate is the decision date as reported by RTÉ, which said the council refused permission that day. Applicants were Crag Rathnew DC Limited and Kent Homes Limited. No megawatt figure is stated.",
  },
];
