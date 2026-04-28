import type { DatacenterSource } from "@/server/db/schema";

export type SeedPermit = {
  datacenterSlug: string;
  kind:
    | "zoning"
    | "environmental"
    | "water"
    | "grid-interconnect"
    | "building"
    | "other";
  issuingBody: string;
  appliedDate?: string;
  issuedDate?: string;
  status: "pending" | "granted" | "denied" | "withdrawn";
  sources: DatacenterSource[];
  notes?: string;
};

// AUDITED via Phase 6.1 WebFetch verification (40 fetches across all entries).
// Major findings: xAI Memphis "first" 2024-11-21 application appears fabricated;
// turbines installed June 2024 without permit, single application Jan 2025.
// AWS New Albany 2022-06-28 was wrong year. Stargate Abilene runs off-grid (no
// ERCOT interconnect). ~30 entries have partial-precision dates (year/month
// only) — orchestrator drops dates that aren't full YYYY-MM-DD.
export const PERMITS: SeedPermit[] = [
  {
    datacenterSlug: "microsoft-mt-pleasant",
    kind: "zoning",
    issuingBody: "Mount Pleasant Village Board",
    issuedDate: "2023-04",
    status: "granted",
    sources: [
      {
        url: "https://www.spokesman.com/stories/2023/may/04/microsoft-to-build-1-billion-data-center-on-wiscon/",
        type: "news",
      },
      {
        url: "https://www.mtpleasantwi.gov/DocumentCenter/View/3131/03282023---Microsoft-Press-Release",
        type: "pr",
      },
    ],
    notes: "Permit dates need source verification — month-level only",
  },
  {
    datacenterSlug: "microsoft-mt-pleasant",
    kind: "zoning",
    issuingBody: "Mount Pleasant Village Board (second tract)",
    issuedDate: "2023-11-27",
    status: "granted",
    sources: [
      {
        url: "https://urbanmilwaukee.com/2023/11/28/mount-pleasant-approves-microsoft-deal-on-foxconn-land/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-mt-pleasant",
    kind: "environmental",
    issuingBody: "Wisconsin DNR",
    status: "pending",
    sources: [
      {
        url: "https://dnr.wisconsin.gov/calendar/hearing/100736",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "microsoft-mt-pleasant",
    kind: "water",
    issuingBody:
      "City of Racine / Wisconsin DNR (Great Lakes Compact diversion, originally for Foxconn 2018)",
    status: "granted",
    sources: [
      {
        url: "https://dnr.wisconsin.gov/topic/WaterUse/Racine",
        type: "permit",
      },
      {
        url: "https://wisconsinexaminer.com/briefs/racine-releases-records-showing-microsoft-data-center-would-use-8-million-gallons-of-water-per-year/",
        type: "news",
      },
    ],
    notes:
      "Microsoft uses pre-existing City of Racine diversion, not a new permit; original 2023-11-10 entry was misleading",
  },

  {
    datacenterSlug: "meta-hyperion-richland",
    kind: "environmental",
    issuingBody: "Louisiana DEQ",
    status: "pending",
    sources: [
      {
        url: "https://thelensnola.org/2026/03/30/meta-triples-order-of-gas-fired-power-plants-for-its-ai-campus-in-louisiana/",
        type: "news",
      },
      {
        url: "https://deq.louisiana.gov/page/air-permit-applications",
        type: "permit",
      },
    ],
    notes:
      "Permit dates need source verification — original 2025-02-04 application date not corroborated",
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    kind: "zoning",
    issuingBody:
      "Richland Parish Police Jury / Louisiana state-level fast-tracking",
    issuedDate: "2024-12",
    status: "granted",
    sources: [
      {
        url: "https://datacenters.atmeta.com/richland-parish-data-center/",
        type: "operator",
      },
      {
        url: "https://about.fb.com/news/2025/12/metas-richland-parish-data-center-supports-louisiana-economy-875-million-in-contracts/",
        type: "pr",
      },
    ],
    notes: "Permit dates need source verification — month-level only",
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    kind: "water",
    issuingBody: "Louisiana DEQ - Water Quality",
    status: "pending",
    sources: [
      { url: "https://deq.louisiana.gov/page/permits", type: "permit" },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    kind: "grid-interconnect",
    issuingBody: "Entergy Louisiana / MISO",
    status: "pending",
    sources: [
      {
        url: "https://www.misoenergy.org/planning/generator-interconnection/",
        type: "permit",
      },
      {
        url: "https://thelensnola.org/2026/03/30/meta-triples-order-of-gas-fired-power-plants-for-its-ai-campus-in-louisiana/",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "meta-eagle-mountain",
    kind: "zoning",
    issuingBody: "Eagle Mountain City Council",
    issuedDate: "2018-06-05",
    status: "granted",
    sources: [
      {
        url: "https://cedarvalleysentinel.com/city-government-2018/eagle-mountain-data-center-moves-forward/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "meta-eagle-mountain",
    kind: "environmental",
    issuingBody: "Utah Division of Air Quality",
    status: "granted",
    sources: [
      {
        url: "https://deq.utah.gov/air-quality/approval-orders",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "meta-eagle-mountain",
    kind: "water",
    issuingBody:
      "Eagle Mountain City (water purchase agreement; Meta holds no separate water right)",
    status: "granted",
    sources: [
      {
        url: "https://grist.org/technology/utah-data-center-water-supply-meta-novva/",
        type: "news",
      },
      {
        url: "https://eaglemountain.gov/datacenter-water-now-re-used-for-wride-park-grass/",
        type: "operator",
      },
    ],
    notes:
      "Original 2019-04-10 'Utah Division of Water Rights to Meta' permit was fabricated — Meta has no water right",
  },

  {
    datacenterSlug: "meta-sarpy-county",
    kind: "zoning",
    issuingBody:
      "Sarpy County Planning Commission / Board of County Commissioners",
    status: "granted",
    sources: [
      {
        url: "https://baxtel.com/data-center/meta-sarpy-nebraska",
        type: "other",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "meta-newton-county",
    kind: "zoning",
    issuingBody:
      "Newton County Board of Commissioners (Stanton Springs overlay)",
    issuedDate: "2018",
    status: "granted",
    sources: [
      {
        url: "https://datacenters.atmeta.com/2021/03/hello-georgia/",
        type: "operator",
      },
    ],
    notes: "Permit dates need source verification — year-only",
  },
  {
    datacenterSlug: "meta-newton-county",
    kind: "environmental",
    issuingBody: "Georgia EPD",
    status: "granted",
    sources: [
      {
        url: "https://epd.georgia.gov/air-protection-branch/permits",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "google-the-dalles",
    kind: "water",
    issuingBody: "City of The Dalles (water service agreement)",
    issuedDate: "2021-11-08",
    status: "granted",
    sources: [
      {
        url: "https://www.opb.org/article/2021/11/09/google-the-dalles-water-data-center/",
        type: "news",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/the-dalles-city-council-passes-controversial-google-data-center-water-deal/",
        type: "news",
      },
    ],
    notes:
      "Original 2022-04-25 issued date corrected — actual council vote Nov 8, 2021",
  },
  {
    datacenterSlug: "google-the-dalles",
    kind: "zoning",
    issuingBody: "Wasco County / The Dalles Planning",
    status: "granted",
    sources: [
      {
        url: "https://www.opb.org/article/2021/11/09/google-the-dalles-water-data-center/",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "aws-northern-virginia-pjm",
    kind: "zoning",
    issuingBody: "Loudoun County Board of Supervisors",
    status: "granted",
    sources: [
      {
        url: "https://www.loudounnow.com/news/by-right-data-centers-eliminated-in-loudoun-existing-applications-grandfathered/article_130515be-0478-11f0-ab4f-7771b6b47f71.html",
        type: "news",
      },
    ],
    notes:
      "Permit dates need source verification — original 2022-05-01/2023-12-12 pair not corroborated",
  },
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    kind: "zoning",
    issuingBody: "Loudoun County (specific denial not confirmed)",
    status: "denied",
    sources: [
      {
        url: "https://patch.com/virginia/ashburn/2-data-center-applications-head-loudoun-board-supervisors",
        type: "news",
      },
    ],
    notes:
      "Permit dates need source verification — original denial entry could not be corroborated",
  },
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    kind: "environmental",
    issuingBody: "Virginia DEQ",
    status: "granted",
    sources: [
      {
        url: "https://www.deq.virginia.gov/permits-regulations/permits/air",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    kind: "grid-interconnect",
    issuingBody: "PJM Interconnection",
    status: "pending",
    sources: [
      {
        url: "https://www.pjm.com/planning/services-requests/interconnection-queues",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "aws-us-east-2-new-albany",
    kind: "zoning",
    issuingBody: "City of New Albany (CRA agreement with AWS)",
    issuedDate: "2023-09",
    status: "granted",
    sources: [
      {
        url: "https://www.10tv.com/article/news/local/amazon-data-centers-new-albany-licking-county/530-670964b5-97f4-49e5-8030-aaf9f85d7492",
        type: "news",
      },
      {
        url: "https://newalbanyohio.org/news/2023/09/amazon-web-services-announces-plan-to-invest-3-5-billion-in-new-albany-by-2030/",
        type: "pr",
      },
    ],
    notes: "Original 2022-06-28 incorrect — actual CRA was September 2023",
  },
  {
    datacenterSlug: "aws-us-east-2-new-albany",
    kind: "environmental",
    issuingBody: "Ohio EPA",
    status: "granted",
    sources: [
      {
        url: "https://epa.ohio.gov/divisions-and-offices/air-pollution-control/permitting/permits-issued",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "microsoft-quincy-columbia",
    kind: "zoning",
    issuingBody: "Grant County Planning",
    status: "granted",
    sources: [
      {
        url: "https://apps.ecology.wa.gov/publications/summarypages/1002048.html",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "microsoft-quincy-columbia",
    kind: "water",
    issuingBody: "Washington Dept of Ecology / Quincy Water Reuse Utility",
    status: "granted",
    sources: [
      {
        url: "https://www.epa.gov/waterreuse/water-reuse-case-study-quincy-washington",
        type: "permit",
      },
      {
        url: "https://local.microsoft.com/blog/partnering-with-the-city-of-quincy-to-open-washingtons-first-industrial-water-reuse-center/",
        type: "operator",
      },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "microsoft-quincy-columbia",
    kind: "environmental",
    issuingBody: "Washington Dept of Ecology - Air Quality",
    status: "granted",
    sources: [
      {
        url: "https://ecology.wa.gov/regulations-permits/permits-certifications/air-quality-permits",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "stargate-abilene",
    kind: "zoning",
    issuingBody: "Taylor County / City of Abilene",
    status: "granted",
    sources: [
      {
        url: "https://www.constructionequipmentguide.com/stargate-artificial-intelligence-data-center-under-way-in-texas/67171",
        type: "news",
      },
    ],
    notes:
      "Permit dates need source verification — site already industrial-zoned (Lancium Clean Campus)",
  },
  {
    datacenterSlug: "stargate-abilene",
    kind: "environmental",
    issuingBody: "Texas Commission on Environmental Quality (TCEQ)",
    issuedDate: "2025-01-22",
    status: "granted",
    sources: [
      { url: "https://hntrbrk.com/generac-stargate/", type: "news" },
      {
        url: "https://newsletter.hntrbrk.com/p/buried-in-stargates-permits-a-generator",
        type: "news",
      },
    ],
    notes: "Applied date approximate (~Oct 2024)",
  },
  {
    datacenterSlug: "stargate-abilene",
    kind: "grid-interconnect",
    issuingBody:
      "Behind-the-meter (Crusoe / Lancium 360MW gas microgrid; no ERCOT large-load interconnect for primary power)",
    status: "granted",
    sources: [
      {
        url: "https://www.constructionowners.com/news/oracle-and-openai-to-power-new-texas-data-center-off-the-grid",
        type: "news",
      },
      {
        url: "https://lanin.substack.com/p/crusoe-is-not-a-neocloud-its-americas",
        type: "news",
      },
    ],
    notes:
      "Original ERCOT interconnect entry was misleading — facility runs off-grid on gas microgrid",
  },
  {
    datacenterSlug: "stargate-abilene",
    kind: "building",
    issuingBody: "City of Abilene Building Inspection",
    issuedDate: "2024",
    status: "granted",
    sources: [
      {
        url: "https://www.constructionequipmentguide.com/stargate-artificial-intelligence-data-center-under-way-in-texas/67171",
        type: "news",
      },
    ],
    notes:
      "Permit dates need source verification — year-only; multiple permits across 2024",
  },

  {
    datacenterSlug: "xai-colossus-memphis",
    kind: "environmental",
    issuingBody:
      "Shelby County Health Department (operating without permit June 2024 - July 2025)",
    appliedDate: "2025-01",
    status: "pending",
    sources: [
      {
        url: "https://www.selc.org/news/xai-built-an-illegal-power-plant-to-power-its-data-center/",
        type: "news",
      },
      {
        url: "https://insideclimatenews.org/news/17072025/elon-musk-xai-data-center-gas-turbines-memphis/",
        type: "news",
      },
      {
        url: "https://512pixels.net/wp-content/uploads/2025/06/2025.06.17-SELC-Notice-of-Intent-to-Sue-for-Violations-of-the-Clean-Air-Act_with-Enclosures.pdf",
        type: "filing",
      },
    ],
    notes:
      "Turbines installed June 2024 without permit; SELC NOI to sue June 17, 2025; original 2024-11-21 first application date appears fabricated",
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    kind: "environmental",
    issuingBody: "Shelby County Health Department - Pollution Control",
    issuedDate: "2025-07-02",
    status: "granted",
    sources: [
      {
        url: "https://www.selc.org/press-release/memphis-health-leaders-grant-air-permit-for-xai-data-center/",
        type: "news",
      },
      {
        url: "https://www.cnbc.com/2025/07/03/musks-xai-gets-permit-for-turbines-to-power-supercomputer-in-memphis.html",
        type: "news",
      },
      {
        url: "https://dailymemphian.com/section/metroshelby-county/article/52889/xai-gets-air-emissions-permit-southwest-memphis",
        type: "news",
      },
      {
        url: "https://cdn.arstechnica.net/wp-content/uploads/2025/07/NAACP-and-YGGs-xAI-Air-Permit-Appeal-7-15-2025.pdf",
        type: "filing",
      },
    ],
    notes:
      "15 turbines / 247.2 MW; valid through Jan 1, 2027; NAACP/SELC appeal July 15, 2025",
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    kind: "zoning",
    issuingBody:
      "Site pre-zoned heavy-industrial; EDGE board approved 522-acre lease (no new zoning permit)",
    status: "granted",
    sources: [
      {
        url: "https://memphischamber.com/economic-development/xai/",
        type: "operator",
      },
      {
        url: "https://wreg.com/news/local/xai-memphis/xai-affiliate-looks-to-lease-522-acres-in-memphis/",
        type: "news",
      },
    ],
    notes:
      "Original 2024-06-05 'Memphis & Shelby County OPD' zoning permit entry was fabricated — no new zoning was required",
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    kind: "grid-interconnect",
    issuingBody: "TVA / MLGW",
    issuedDate: "2024-11-07",
    status: "granted",
    sources: [
      {
        url: "https://wreg.com/news/local/tva-oks-additional-150-mw-of-electricity-for-xai-memphis-data-center/",
        type: "news",
      },
      {
        url: "https://www.actionnews5.com/2024/11/07/tva-approves-providing-power-xai-facility/",
        type: "news",
      },
      {
        url: "https://www.datacenterdynamics.com/en/news/xai-colossus-memphis-power-tva/",
        type: "news",
      },
    ],
    notes:
      "Original 2024-08-15 issued date corrected to 2024-11-07 (TVA approval of additional 150 MW)",
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    kind: "water",
    issuingBody: "TDEC (xAI water recycling plant operating permit)",
    status: "granted",
    sources: [
      {
        url: "https://www.memphisflyer.com/state-issues-operating-permit-for-colossus-water-plant/",
        type: "news",
      },
      {
        url: "https://www.fox13memphis.com/news/work-begins-on-new-80m-xai-water-recycling-plant/article_29064c97-abda-4c85-b51b-4562361cfb3a.html",
        type: "news",
      },
      {
        url: "https://www.protectouraquifer.org/issues/xai-supercomputer",
        type: "other",
      },
    ],
    notes:
      "Original 'MLGW Sand Aquifer permit' framing inaccurate — actual permit is TDEC wastewater operating permit for $80M recycling plant",
  },

  {
    datacenterSlug: "meta-clonee",
    kind: "zoning",
    issuingBody: "An Bord Pleanála (SID)",
    status: "granted",
    sources: [
      {
        url: "https://www.irishtimes.com/business/technology/facebook-wins-planning-approval-for-200m-meath-data-centre-1.2403252",
        type: "news",
      },
      { url: "https://www.pleanala.ie/", type: "permit" },
    ],
    notes:
      "Permit dates need source verification — original 2017-08-10/2018-03-22 SID dates not corroborated",
  },
  {
    datacenterSlug: "meta-clonee",
    kind: "zoning",
    issuingBody: "An Bord Pleanála (Phase 4)",
    status: "granted",
    sources: [{ url: "https://www.pleanala.ie/", type: "permit" }],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "google-eemshaven",
    kind: "environmental",
    issuingBody: "Province of Groningen",
    issuedDate: "2014",
    status: "granted",
    sources: [
      {
        url: "https://datacenters.google/locations/eemshaven-netherlands-var/",
        type: "operator",
      },
      {
        url: "https://www.computerworld.com/article/1377141/googles-massive-new-dutch-data-center-to-cost-770m.html",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification — year-only",
  },
  {
    datacenterSlug: "google-eemshaven",
    kind: "zoning",
    issuingBody: "Gemeente Eemsdelta",
    status: "granted",
    sources: [{ url: "https://www.rtvnoord.nl/nieuws/", type: "news" }],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "meta-zeewolde",
    kind: "zoning",
    issuingBody: "Gemeente Zeewolde",
    issuedDate: "2021-12",
    status: "granted",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/dutch-govt-removes-zoning-permission-for-zeewolde-land-earmarked-for-meta-data-center/",
        type: "news",
      },
      {
        url: "https://nltimes.nl/2023/09/21/court-strikes-metas-data-center-plans-zeewolde",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification — month-level only",
  },
  {
    datacenterSlug: "meta-zeewolde",
    kind: "zoning",
    issuingBody:
      "Eerste Kamer / Rijksvastgoedbedrijf (Dutch Senate motion blocked land sale)",
    issuedDate: "2022-03",
    status: "withdrawn",
    sources: [
      {
        url: "https://www.bloomberg.com/news/articles/2022-03-29/meta-halts-dutch-mega-data-center-plans-amid-rising-opposition",
        type: "news",
      },
      {
        url: "https://datacentremagazine.com/articles/meta-permanently-cancels-plans-to-build-zeewolde-data-centre",
        type: "news",
      },
      {
        url: "https://nltimes.nl/2023/09/21/court-strikes-metas-data-center-plans-zeewolde",
        type: "news",
      },
    ],
    notes: "Senate vote March 2022; final court strike-down Sept 2023",
  },

  {
    datacenterSlug: "meta-lulea",
    kind: "environmental",
    issuingBody: "Norrbotten County Administrative Board (Länsstyrelsen)",
    issuedDate: "2012",
    status: "granted",
    sources: [
      { url: "https://www.lansstyrelsen.se/norrbotten/", type: "permit" },
      {
        url: "https://www.ncc.com/our-projects/facebook-data-center-in-lulea/",
        type: "operator",
      },
    ],
    notes: "Permit dates need source verification — year-only",
  },

  {
    datacenterSlug: "coreweave-plano",
    kind: "zoning",
    issuingBody: "City of Plano P&Z Commission",
    status: "granted",
    sources: [
      {
        url: "https://www.prnewswire.com/news-releases/coreweave-opens-new-texas-data-center-to-expand-access-to-high-performance-gpus-301884897.html",
        type: "pr",
      },
      {
        url: "https://communityimpact.com/dallas-fort-worth/plano-south/development/2023/07/26/coreweave-to-open-16b-data-center-in-plano/",
        type: "news",
      },
    ],
    notes:
      "Permit dates need source verification — facility was tenant build-out in existing Lincoln Rackhouse",
  },
  {
    datacenterSlug: "coreweave-plano",
    kind: "building",
    issuingBody: "City of Plano Building Inspection",
    status: "granted",
    sources: [
      { url: "https://www.plano.gov/200/Building-Inspections", type: "permit" },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "microsoft-san-antonio",
    kind: "zoning",
    issuingBody: "City of San Antonio Zoning Commission",
    status: "granted",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/microsoft-plans-482m-data-center-in-san-antonio-texas/",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "microsoft-san-antonio",
    kind: "water",
    issuingBody: "San Antonio Water System (SAWS)",
    status: "granted",
    sources: [
      {
        url: "https://www.sacurrent.com/news/san-antonio-data-centers-guzzled-463-million-gallons-of-water-as-area-faced-drought-38116670/",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "aws-us-west-2-boardman",
    kind: "zoning",
    issuingBody: "Morrow County Planning Commission",
    issuedDate: "2022-03",
    status: "granted",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/aws-planning-at-least-four-more-data-centers-in-morrow-county-oregon/",
        type: "news",
      },
    ],
    notes: "Original 2020-11-12 incorrect; actual approval was March 2022",
  },
  {
    datacenterSlug: "aws-us-west-2-boardman",
    kind: "water",
    issuingBody: "Oregon Water Resources Department",
    status: "granted",
    sources: [
      {
        url: "https://www.oregon.gov/owrd/programs/wr/permits/",
        type: "permit",
      },
      {
        url: "https://waterwatch.org/how-oregons-data-center-boom-is-supercharging-a-water-crisis/",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification",
  },
  {
    datacenterSlug: "aws-us-west-2-boardman",
    kind: "environmental",
    issuingBody: "Oregon DEQ",
    status: "granted",
    sources: [
      {
        url: "https://www.oregon.gov/deq/aq/Pages/Air-Permits.aspx",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },

  {
    datacenterSlug: "apple-maiden-nc",
    kind: "zoning",
    issuingBody: "Catawba County Board of Commissioners / Town of Maiden",
    issuedDate: "2009",
    status: "granted",
    sources: [
      {
        url: "https://www.datacenterknowledge.com/archives/2009/06/01/apple-deal-all-but-done-for-catawba-nc",
        type: "news",
      },
    ],
    notes: "Permit dates need source verification — year-only",
  },
  {
    datacenterSlug: "apple-maiden-nc",
    kind: "environmental",
    issuingBody: "NC DEQ - Division of Air Quality",
    status: "granted",
    sources: [
      {
        url: "https://deq.nc.gov/about/divisions/air-quality/permitting",
        type: "permit",
      },
    ],
    notes: "Permit dates need source verification",
  },
];
