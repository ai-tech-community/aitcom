export type BrandUpsert = {
  slug: string;
  jurisdiction?: string;
  jurisdictionRegion?: string;
  entityType?:
    | "corporation"
    | "llc"
    | "holding"
    | "foundation"
    | "public"
    | "govt"
    | "joint-venture"
    | "reit"
    | "limited-partnership"
    | "non-profit";
  ultimateBeneficialOwner?: string;
};

export type OwnershipEdgeSeed = {
  parentSlug: string;
  childSlug: string;
  ownershipPct?: number;
  effectiveFrom?: string;
  sourceUrl: string;
  notes?: string;
};

export type NewBrandSeed = {
  slug: string;
  canonicalName: string;
  entityType?: BrandUpsert["entityType"];
  jurisdiction?: string;
  jurisdictionRegion?: string;
  website?: string;
};

// AUDITED via Phase 6.1 WebFetch verification (37 fetches).
// Critical findings: mubadala → g42 "majority" was FACTUALLY WRONG
// (Royal Group / Sheikh Tahnoun bin Zayed is majority, Mubadala is
// minority); softbank → openai via Stargate URL was wrong instrument
// (Stargate is JV, not equity); x-corp → xai direction was inverted
// (xAI Holdings is parent of both); reliance → jio was wrong pct
// (~67% not 100%); e& exited Khazna Feb 2025 (edge historical);
// CyrusOne is now private (entityType corrected); OpenAI restructured
// to PBC Oct 2025; iris-energy renamed to IREN.
export const BRAND_UPSERTS: BrandUpsert[] = [
  { slug: "aws", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "corporation" },
  { slug: "microsoft", jurisdiction: "US", jurisdictionRegion: "WA", entityType: "public" },
  { slug: "google", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "llc" },
  { slug: "meta", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "oracle", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "apple", jurisdiction: "US", jurisdictionRegion: "CA", entityType: "public" },
  // CORRECTED: post Oct 2025 restructure, OpenAI for-profit is now OpenAI Group PBC; was non-profit pre-restructure
  { slug: "openai", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "corporation" },
  { slug: "xai", jurisdiction: "US", jurisdictionRegion: "NV", entityType: "corporation", ultimateBeneficialOwner: "Elon Musk" },
  { slug: "coreweave", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "crusoe", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "corporation" },
  { slug: "nebius", jurisdiction: "NL", entityType: "public" },
  // CORRECTED: atNorth Holding AB suggests Swedish parent; HQ Iceland but holdco SE
  { slug: "atnorth", jurisdiction: "SE", entityType: "corporation" },
  { slug: "yondr-group", jurisdiction: "NL", entityType: "corporation" },
  { slug: "yotta", jurisdiction: "IN", jurisdictionRegion: "Maharashtra", entityType: "corporation", ultimateBeneficialOwner: "Hiranandani family" },
  { slug: "adaniconnex", jurisdiction: "IN", entityType: "joint-venture" },
  { slug: "equinix", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "reit" },
  { slug: "digital-realty", jurisdiction: "US", jurisdictionRegion: "MD", entityType: "reit" },
  { slug: "ntt", jurisdiction: "JP", entityType: "public" },
  // CORRECTED: CyrusOne is PRIVATE since KKR/GIP take-private March 25, 2022
  { slug: "cyrusone", jurisdiction: "US", jurisdictionRegion: "MD", entityType: "corporation" },
  // CORRECTED: G42 majority is Royal Group (Tahnoun bin Zayed) — Mubadala is MINORITY only
  { slug: "g42", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi", entityType: "holding", ultimateBeneficialOwner: "Royal Group / Sheikh Tahnoun bin Zayed" },
  { slug: "khazna", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi", entityType: "joint-venture" },
  { slug: "humain", jurisdiction: "SA", jurisdictionRegion: "Riyadh", entityType: "corporation", ultimateBeneficialOwner: "Government of Saudi Arabia (via PIF)" },
  // Cloud-business-unit entries — KY jurisdiction inherited from Cayman parent
  { slug: "alibaba-cloud", jurisdiction: "KY", entityType: "corporation" },
  { slug: "tencent-cloud", jurisdiction: "KY", entityType: "corporation" },
  { slug: "baidu-cloud", jurisdiction: "KY", entityType: "corporation" },
  { slug: "21vianet", jurisdiction: "KY", entityType: "public" },
  { slug: "softbank", jurisdiction: "JP", entityType: "public" },
  { slug: "naver", jurisdiction: "KR", entityType: "public" },
  { slug: "ytl", jurisdiction: "MY", entityType: "public", ultimateBeneficialOwner: "Yeoh family" },
  { slug: "reliance-jio", jurisdiction: "IN", entityType: "corporation", ultimateBeneficialOwner: "Mukesh Ambani family (~67% via RIL)" },
  // CORRECTED: rebranded to IREN Limited Nov 2024; NASDAQ:IREN only (ASX listing failed)
  { slug: "iris-energy", jurisdiction: "AU", entityType: "public" },
  { slug: "applied-digital", jurisdiction: "US", jurisdictionRegion: "NV", entityType: "public" },
  { slug: "terawulf", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "galaxy-digital", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public", ultimateBeneficialOwner: "Michael Novogratz (founder)" },
  { slug: "nvidia", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "supermicro", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
];

export const NEW_BRANDS: NewBrandSeed[] = [
  { slug: "alphabet-inc", canonicalName: "Alphabet Inc.", entityType: "public", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://abc.xyz" },
  // CORRECTED: renamed from "OpenAI Inc. (Nonprofit)" to "OpenAI Foundation" Oct 2025
  { slug: "openai-foundation", canonicalName: "OpenAI Foundation", entityType: "non-profit", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://openai.com/our-structure/" },
  { slug: "openai-group-pbc", canonicalName: "OpenAI Group PBC (for-profit arm)", entityType: "corporation", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://openai.com" },
  // CORRECTED: X Corp re-domiciled NV; now under xAI Holdings
  { slug: "x-corp", canonicalName: "X Corp", entityType: "corporation", jurisdiction: "US", jurisdictionRegion: "NV", website: "https://x.com" },
  // NEW: parent of xAI + X Corp post Mar 2025 merger
  { slug: "xai-holdings", canonicalName: "xAI Holdings Corp", entityType: "corporation", jurisdiction: "US", jurisdictionRegion: "NV" },
  { slug: "mubadala", canonicalName: "Mubadala Investment Company", entityType: "govt", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi", website: "https://www.mubadala.com" },
  // NEW: actual majority owner of G42 (UBO Sheikh Tahnoun bin Zayed)
  { slug: "royal-group", canonicalName: "Royal Group (RGH1 Investment SPV RSCC Ltd)", entityType: "holding", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi" },
  { slug: "pif", canonicalName: "Public Investment Fund", entityType: "govt", jurisdiction: "SA", jurisdictionRegion: "Riyadh", website: "https://www.pif.gov.sa" },
  { slug: "etisalat-and", canonicalName: "Emirates Telecommunications Group (e&)", entityType: "public", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi", website: "https://www.eand.com" },
  { slug: "alibaba-group-holding", canonicalName: "Alibaba Group Holding Ltd", entityType: "public", jurisdiction: "KY", website: "https://www.alibabagroup.com" },
  { slug: "tencent-holdings", canonicalName: "Tencent Holdings Ltd", entityType: "public", jurisdiction: "KY", website: "https://www.tencent.com" },
  { slug: "baidu-inc", canonicalName: "Baidu Inc.", entityType: "public", jurisdiction: "KY", website: "https://ir.baidu.com" },
  { slug: "softbank-group", canonicalName: "SoftBank Group Corp", entityType: "public", jurisdiction: "JP", website: "https://group.softbank" },
  { slug: "partners-group", canonicalName: "Partners Group Holding AG", entityType: "public", jurisdiction: "CH", jurisdictionRegion: "Zug", website: "https://www.partnersgroup.com" },
  { slug: "reliance-industries", canonicalName: "Reliance Industries Limited", entityType: "public", jurisdiction: "IN", jurisdictionRegion: "Maharashtra", website: "https://www.ril.com" },
  { slug: "kkr", canonicalName: "KKR & Co. Inc.", entityType: "public", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://www.kkr.com" },
  { slug: "global-infrastructure-partners", canonicalName: "Global Infrastructure Partners", entityType: "limited-partnership", jurisdiction: "US", jurisdictionRegion: "NY", website: "https://www.global-infra.com" },
  // NEW: BlackRock acquired GIP Oct 2024
  { slug: "blackrock", canonicalName: "BlackRock Inc.", entityType: "public", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://www.blackrock.com" },
  { slug: "digitalbridge", canonicalName: "DigitalBridge Group Inc.", entityType: "public", jurisdiction: "US", jurisdictionRegion: "MD", website: "https://www.digitalbridge.com" },
  { slug: "silver-lake", canonicalName: "Silver Lake Partners", entityType: "limited-partnership", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://www.silverlake.com" },
  { slug: "adani-enterprises", canonicalName: "Adani Enterprises Ltd", entityType: "public", jurisdiction: "IN", jurisdictionRegion: "Gujarat", website: "https://www.adani.com" },
  { slug: "edgeconnex", canonicalName: "EdgeConneX Inc.", entityType: "corporation", jurisdiction: "US", jurisdictionRegion: "VA", website: "https://www.edgeconnex.com" },
  // NEW: parent referenced by yotta edge (originally missing from NEW_BRANDS)
  { slug: "hiranandani-group", canonicalName: "Hiranandani Group", entityType: "holding", jurisdiction: "IN", jurisdictionRegion: "Maharashtra" },
];

export const OWNERSHIP_EDGES: OwnershipEdgeSeed[] = [
  // VERIFIED: Google LLC wholly owned by Alphabet post Oct 2, 2015
  { parentSlug: "alphabet-inc", childSlug: "google", ownershipPct: 100, effectiveFrom: "2015-10-02", sourceUrl: "https://en.wikipedia.org/wiki/Alphabet_Inc.", notes: "Google LLC wholly owned by Alphabet post-2015 reorganization" },

  // CORRECTED: post Oct 2025 restructure, Foundation holds ~26% of for-profit Group PBC + retains board control
  { parentSlug: "openai-foundation", childSlug: "openai-group-pbc", ownershipPct: 26, effectiveFrom: "2025-10-28", sourceUrl: "https://openai.com/index/built-to-benefit-everyone/", notes: "Foundation holds ~26% equity (~$130B value) + retains board control of for-profit PBC" },

  // CORRECTED: Microsoft holds ~27% of OpenAI Group PBC post Oct 28, 2025 restructure (CNBC); minority equity, not consolidated
  { parentSlug: "microsoft", childSlug: "openai-group-pbc", ownershipPct: 27, effectiveFrom: "2025-10-28", sourceUrl: "https://www.cnbc.com/2025/10/28/open-ai-for-profit-microsoft.html", notes: "Microsoft holds ~27% of OpenAI Group PBC on as-converted diluted basis (~$135B value); minority equity, not consolidated" },

  // CORRECTED: original x-corp → xai was direction-inverted; xAI Holdings is parent of BOTH
  { parentSlug: "xai-holdings", childSlug: "xai", effectiveFrom: "2025-03-28", sourceUrl: "https://en.wikipedia.org/wiki/XAI_(company)", notes: "March 28, 2025 xAI Holdings Corp formed as parent via all-stock merger ($80B xAI valuation)" },
  { parentSlug: "xai-holdings", childSlug: "x-corp", effectiveFrom: "2025-03-28", sourceUrl: "https://techcrunch.com/2025/03/29/elon-musk-says-xai-acquired-x/", notes: "March 28, 2025 X Corp became subsidiary of xAI Holdings ($33B X valuation)" },

  // CORRECTED: announced Dec 21, 2021, closed early 2022 (NOT Aug 2022). NOTE: Partners Group is exiting via $4B sale to Equinix/CPP announced Feb 2026.
  { parentSlug: "partners-group", childSlug: "atnorth", effectiveFrom: "2022-01", sourceUrl: "https://www.atnorth.com/news/atnorth-acquired-by-partners-group/", notes: "Partners Group acquired atNorth — announced Dec 21, 2021, closed early 2022. Currently being sold to Equinix/CPP for $4B (Feb 2026 announcement)" },

  // VERIFIED: Yotta is 100% Hiranandani Group subsidiary
  { parentSlug: "hiranandani-group", childSlug: "yotta", ownershipPct: 100, sourceUrl: "https://yotta.com/company/about-us/", notes: "Yotta Data Services Pvt Ltd is 100% Hiranandani Group subsidiary" },

  // VERIFIED: 50:50 JV announced Feb 23, 2021; URL replaced with verifiable press release
  { parentSlug: "adani-enterprises", childSlug: "adaniconnex", ownershipPct: 50, effectiveFrom: "2021-02-23", sourceUrl: "https://www.adanienterprises.com/newsroom/media-releases/adaniconnex-a-new-data-center-joint-venture-formed-between-adani-enterprises-and-edgeconnex", notes: "50:50 JV with EdgeConneX, Feb 23, 2021" },
  { parentSlug: "edgeconnex", childSlug: "adaniconnex", ownershipPct: 50, effectiveFrom: "2021-02-23", sourceUrl: "https://www.edgeconnex.com/news/press-releases/adaniconnex-a-new-joint-venture-formed-between-edgeconnex-and-adani-enterprises-to-empower-digital-india-with-a-national-platform-of-data-centers/", notes: "EdgeConneX 50% partner; JV announced Feb 23, 2021" },

  // VERIFIED: KKR + GIP $15B take-private completed March 25, 2022
  { parentSlug: "kkr", childSlug: "cyrusone", ownershipPct: 50, effectiveFrom: "2022-03-25", sourceUrl: "https://www.global-infra.com/news/kkr-and-gip-complete-acquisition-of-cyrusone/", notes: "KKR co-led $15B take-private with GIP completed March 25, 2022" },
  { parentSlug: "global-infrastructure-partners", childSlug: "cyrusone", ownershipPct: 50, effectiveFrom: "2022-03-25", sourceUrl: "https://www.global-infra.com/news/kkr-and-gip-complete-acquisition-of-cyrusone/", notes: "GIP joint partner with KKR; GIP became BlackRock subsidiary Oct 2024" },

  // NEW: BlackRock acquired GIP Oct 2024
  { parentSlug: "blackrock", childSlug: "global-infrastructure-partners", effectiveFrom: "2024-10-01", sourceUrl: "https://en.wikipedia.org/wiki/Global_Infrastructure_Partners", notes: "BlackRock acquired GIP, deal closed Oct 2024" },

  // CORRECTED: $9.2B equity investment completed June 2024 (NOT 2020)
  { parentSlug: "digitalbridge", childSlug: "vantage", effectiveFrom: "2024-06", sourceUrl: "https://www.digitalbridge.com/news/2024-06-13-vantage-data-centers-completes-92-billion-equity-investment-led-by-digitalbridge-and-silver-lake", notes: "DigitalBridge has been key Vantage owner since 2017; co-led $9.2B investment completed June 2024 with Silver Lake" },
  { parentSlug: "silver-lake", childSlug: "vantage", effectiveFrom: "2024-06", sourceUrl: "https://www.silverlake.com/vantage-data-centers-announces-6-4-billion-equity-investment-led-by-digitalbridge-and-silver-lake/", notes: "Silver Lake co-led $6.4B announcement Jan 2024 / $9.2B completed June 2024 (NOT 2020 as originally claimed)" },

  // CORRECTED: Mubadala is MINORITY (not majority); majority is Royal Group
  { parentSlug: "royal-group", childSlug: "g42", sourceUrl: "https://en.wikipedia.org/wiki/G42_(company)", notes: "Majority shareholder of G42 (per SEC disclosures); UBO Sheikh Tahnoun bin Zayed" },
  { parentSlug: "mubadala", childSlug: "g42", sourceUrl: "https://www.mubadala.com/en/news/mubadala-takes-stake-group-42", notes: "Mubadala took MINORITY stake in G42 Nov 2020 (Injazat + Khazna transferred to G42); NOT majority" },

  // CORRECTED: 60/40 G42/e& JV; e& EXITED Feb 2025 → G42 60% + MGX + Silver Lake minorities
  { parentSlug: "g42", childSlug: "khazna", ownershipPct: 60, sourceUrl: "https://www.khazna.ae/news/etisalat-group-and-g42-join-forces-to-establish-uaes-largest-data-center-provider-under-khazna-data-centers/", notes: "G42 holds 60% of Khazna; pre-Feb 2025 was 60/40 with e&; post Feb 2025 e& exit, G42 60% + MGX + Silver Lake minorities" },

  // NOTE: e& → khazna edge intentionally REMOVED (e& exited Feb 26, 2025; sold 40% to G42 for $2.2B)

  // CORRECTED: PIF retains majority but pct is no longer 100% post Aramco minority Oct 2025; pct removed
  { parentSlug: "pif", childSlug: "humain", effectiveFrom: "2025-05-12", sourceUrl: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2025/hrh-crown-prince-launches-humain-as-global-ai-powerhouse/", notes: "PIF launched HUMAIN May 12, 2025 as wholly owned; Aramco took 'significant minority stake' Oct 2025; PIF still majority but exact pct undisclosed" },

  { parentSlug: "alibaba-group-holding", childSlug: "alibaba-cloud", ownershipPct: 100, sourceUrl: "https://en.wikipedia.org/wiki/Alibaba_Cloud", notes: "Wholly owned business segment of Alibaba Group Holding (KY)" },
  { parentSlug: "tencent-holdings", childSlug: "tencent-cloud", ownershipPct: 100, sourceUrl: "https://en.wikipedia.org/wiki/Tencent_Cloud", notes: "Wholly owned business unit of Tencent Holdings" },
  { parentSlug: "baidu-inc", childSlug: "baidu-cloud", ownershipPct: 100, sourceUrl: "https://en.wikipedia.org/wiki/Baidu", notes: "Baidu AI Cloud is wholly owned business unit of Baidu Inc." },

  // NOTE: softbank-group → openai via Stargate URL was REMOVED (wrong instrument).
  // SoftBank's actual OpenAI ownership came from $40B direct investment Mar 2025, not Stargate.
  { parentSlug: "softbank-group", childSlug: "openai-group-pbc", effectiveFrom: "2025-03", sourceUrl: "https://editorialge.com/softbank-openai-investment/", notes: "SoftBank $40B direct OpenAI investment (announced Mar 2025) makes SoftBank a meaningful OpenAI shareholder — NOT the Stargate JV. Minority equity, not consolidated. URL needs SEC-grade verification." },

  // CORRECTED: RIL holds ~67% (not 100%); ~33% with Meta/Google/KKR/Vista/PIF/Mubadala minorities
  { parentSlug: "reliance-industries", childSlug: "reliance-jio", ownershipPct: 67, sourceUrl: "https://en.wikipedia.org/wiki/Jio_Platforms", notes: "RIL holds ~67% of Jio Platforms; ~33% held by Meta (9.99%), Google (7.7%), KKR, Vista, PIF, Mubadala, Silver Lake" },
];
