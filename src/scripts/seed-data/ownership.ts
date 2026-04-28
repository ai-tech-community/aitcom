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

export const BRAND_UPSERTS: BrandUpsert[] = [
  { slug: "aws", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "corporation" },
  { slug: "microsoft", jurisdiction: "US", jurisdictionRegion: "WA", entityType: "public" },
  { slug: "google", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "llc" },
  { slug: "meta", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "oracle", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "apple", jurisdiction: "US", jurisdictionRegion: "CA", entityType: "public" },
  { slug: "openai", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "non-profit" },
  { slug: "xai", jurisdiction: "US", jurisdictionRegion: "NV", entityType: "corporation", ultimateBeneficialOwner: "Elon Musk" },
  { slug: "coreweave", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "crusoe", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "corporation" },
  { slug: "nebius", jurisdiction: "NL", entityType: "public" },
  { slug: "atnorth", jurisdiction: "IS", entityType: "corporation" },
  { slug: "yondr-group", jurisdiction: "NL", entityType: "corporation" },
  { slug: "yotta", jurisdiction: "IN", jurisdictionRegion: "Maharashtra", entityType: "corporation", ultimateBeneficialOwner: "Hiranandani family" },
  { slug: "adaniconnex", jurisdiction: "IN", entityType: "joint-venture" },
  { slug: "equinix", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "reit" },
  { slug: "digital-realty", jurisdiction: "US", jurisdictionRegion: "MD", entityType: "reit" },
  { slug: "ntt", jurisdiction: "JP", entityType: "public" },
  { slug: "cyrusone", jurisdiction: "US", jurisdictionRegion: "MD", entityType: "reit" },
  { slug: "g42", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi", entityType: "holding", ultimateBeneficialOwner: "Government of Abu Dhabi (via Mubadala Investment Co)" },
  { slug: "khazna", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi", entityType: "joint-venture" },
  { slug: "humain", jurisdiction: "SA", jurisdictionRegion: "Riyadh", entityType: "corporation", ultimateBeneficialOwner: "Government of Saudi Arabia (via PIF)" },
  { slug: "alibaba-cloud", jurisdiction: "KY", entityType: "public" },
  { slug: "tencent-cloud", jurisdiction: "KY", entityType: "public" },
  { slug: "baidu-cloud", jurisdiction: "KY", entityType: "public" },
  { slug: "21vianet", jurisdiction: "KY", entityType: "public" },
  { slug: "softbank", jurisdiction: "JP", entityType: "public" },
  { slug: "naver", jurisdiction: "KR", entityType: "public" },
  { slug: "ytl", jurisdiction: "MY", entityType: "public", ultimateBeneficialOwner: "Yeoh family" },
  { slug: "reliance-jio", jurisdiction: "IN", entityType: "corporation", ultimateBeneficialOwner: "Mukesh Ambani family" },
  { slug: "iris-energy", jurisdiction: "AU", entityType: "public" },
  { slug: "applied-digital", jurisdiction: "US", jurisdictionRegion: "NV", entityType: "public" },
  { slug: "terawulf", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "galaxy-digital", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public", ultimateBeneficialOwner: "Michael Novogratz (founder)" },
  { slug: "nvidia", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
  { slug: "supermicro", jurisdiction: "US", jurisdictionRegion: "DE", entityType: "public" },
];

export const NEW_BRANDS: NewBrandSeed[] = [
  { slug: "alphabet-inc", canonicalName: "Alphabet Inc.", entityType: "public", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://abc.xyz" },
  { slug: "openai-inc-nonprofit", canonicalName: "OpenAI Inc. (Nonprofit)", entityType: "non-profit", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://openai.com/our-structure/" },
  { slug: "x-corp", canonicalName: "X Corp", entityType: "corporation", jurisdiction: "US", jurisdictionRegion: "NV", website: "https://x.com" },
  { slug: "mubadala", canonicalName: "Mubadala Investment Company", entityType: "govt", jurisdiction: "AE", jurisdictionRegion: "Abu Dhabi", website: "https://www.mubadala.com" },
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
  { slug: "digitalbridge", canonicalName: "DigitalBridge Group Inc.", entityType: "public", jurisdiction: "US", jurisdictionRegion: "MD", website: "https://www.digitalbridge.com" },
  { slug: "silver-lake", canonicalName: "Silver Lake Partners", entityType: "limited-partnership", jurisdiction: "US", jurisdictionRegion: "DE", website: "https://www.silverlake.com" },
  { slug: "adani-enterprises", canonicalName: "Adani Enterprises Ltd", entityType: "public", jurisdiction: "IN", jurisdictionRegion: "Gujarat", website: "https://www.adani.com" },
  { slug: "edgeconnex", canonicalName: "EdgeConneX Inc.", entityType: "corporation", jurisdiction: "US", jurisdictionRegion: "VA", website: "https://www.edgeconnex.com" },
];

export const OWNERSHIP_EDGES: OwnershipEdgeSeed[] = [
  { parentSlug: "alphabet-inc", childSlug: "google", ownershipPct: 100, effectiveFrom: "2015-10-02", sourceUrl: "https://abc.xyz/investor/", notes: "Google LLC wholly owned by Alphabet post-2015 reorganization" },
  { parentSlug: "openai-inc-nonprofit", childSlug: "openai", sourceUrl: "https://openai.com/our-structure/", notes: "OpenAI Inc nonprofit controls capped-profit OpenAI Global LLC" },
  { parentSlug: "microsoft", childSlug: "openai", sourceUrl: "https://www.microsoft.com/en-us/Investor/", notes: "Microsoft holds minority equity in OpenAI Global LLC; not consolidated" },
  { parentSlug: "x-corp", childSlug: "xai", effectiveFrom: "2025-03-28", sourceUrl: "https://www.reuters.com/technology/musks-xai-acquires-x-formerly-twitter-all-stock-deal-2025-03-28/", notes: "March 2025 xAI acquired X Corp under xAI Holdings" },
  { parentSlug: "partners-group", childSlug: "atnorth", sourceUrl: "https://www.partnersgroup.com/en/news-views/", notes: "Partners Group acquired majority stake in atNorth Aug 2022" },
  { parentSlug: "hiranandani-group", childSlug: "yotta", sourceUrl: "https://yotta.com/about-us/", notes: "Yotta is part of Hiranandani Group's digital infra arm" },
  { parentSlug: "adani-enterprises", childSlug: "adaniconnex", ownershipPct: 50, sourceUrl: "https://www.adani.com/businesses/data-centres", notes: "50/50 JV with EdgeConneX" },
  { parentSlug: "edgeconnex", childSlug: "adaniconnex", ownershipPct: 50, sourceUrl: "https://www.edgeconnex.com/news/", notes: "EdgeConneX 50% partner" },
  { parentSlug: "kkr", childSlug: "cyrusone", effectiveFrom: "2022-03-25", sourceUrl: "https://www.kkr.com/about/media/", notes: "March 2022 take-private with GIP" },
  { parentSlug: "global-infrastructure-partners", childSlug: "cyrusone", effectiveFrom: "2022-03-25", sourceUrl: "https://www.reuters.com/business/", notes: "GIP joint partner with KKR" },
  { parentSlug: "digitalbridge", childSlug: "vantage", sourceUrl: "https://www.digitalbridge.com/portfolio/vantage-data-centers/", notes: "DigitalBridge major equity holder" },
  { parentSlug: "silver-lake", childSlug: "vantage", sourceUrl: "https://www.silverlake.com/news/", notes: "Silver Lake co-led 2020 investment" },
  { parentSlug: "mubadala", childSlug: "g42", sourceUrl: "https://www.mubadala.com/en/news/", notes: "Mubadala holds majority in G42" },
  { parentSlug: "g42", childSlug: "khazna", sourceUrl: "https://www.khazna.ae/about-us/", notes: "Khazna is JV majority-controlled by G42" },
  { parentSlug: "etisalat-and", childSlug: "khazna", sourceUrl: "https://www.etisalat.com/en/ir/", notes: "e& holds minority JV stake" },
  { parentSlug: "pif", childSlug: "humain", ownershipPct: 100, effectiveFrom: "2025-05-12", sourceUrl: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2025/", notes: "PIF launched HUMAIN as wholly owned AI subsidiary May 2025" },
  { parentSlug: "alibaba-group-holding", childSlug: "alibaba-cloud", ownershipPct: 100, sourceUrl: "https://www.alibabagroup.com/", notes: "Wholly owned business segment" },
  { parentSlug: "tencent-holdings", childSlug: "tencent-cloud", ownershipPct: 100, sourceUrl: "https://www.tencent.com/en-us/investors/", notes: "Wholly owned business unit" },
  { parentSlug: "baidu-inc", childSlug: "baidu-cloud", ownershipPct: 100, sourceUrl: "https://ir.baidu.com/", notes: "Wholly owned business unit" },
  { parentSlug: "softbank-group", childSlug: "openai", sourceUrl: "https://www.reuters.com/technology/openai-softbank-oracle-launch-stargate-100-billion-ai-infrastructure-venture-2025-01-21/", notes: "January 2025 Stargate JV initial equity partner" },
  { parentSlug: "reliance-industries", childSlug: "reliance-jio", sourceUrl: "https://www.ril.com/InvestorRelations/", notes: "Jio Platforms is Reliance Industries subsidiary" },
];
