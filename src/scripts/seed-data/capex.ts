import type { DatacenterSource } from "@/server/db/schema";

export type CapexUpdate = {
  datacenterSlug: string;
  capexUsd: number;
  sources: DatacenterSource[];
  notes?: string;
};

// AUDITED via Phase 6.1 WebFetch verification (49 fetches).
// Major findings: xAI $6B was a funding round, not capex (real ~$18B);
// Reliance Jamnagar $5B → $20B; Google Saint-Ghislain $1.2B → $11B
// (€5B + €6B cumulative); Meta Odense $200M → $2B (DKK figures);
// CoreWeave Plano $1.2B (Chirisa stub) → $1.6B (Plano-specific);
// Stargate Abilene-2 expansion was CANCELLED March 2026.
// Most blog.google and about.fb.com URLs in original seed 404'd.
export const CAPEX_UPDATES: CapexUpdate[] = [
  // VERIFIED: ~$15B Phase 1 Abilene; consistent across multiple sources
  { datacenterSlug: "stargate-abilene", capexUsd: 15_000_000_000, sources: [{ url: "https://openai.com/index/announcing-the-stargate-project/", title: "Announcing The Stargate Project", type: "operator" }, { url: "https://openai.com/index/five-new-stargate-sites/", title: "Five new Stargate sites", type: "operator" }] },

  // CORRECTED: 600MW expansion CANCELLED March 2026; reduced from $10B to industry midpoint $2B
  { datacenterSlug: "oracle-stargate-abilene-2", capexUsd: 2_000_000_000, sources: [{ url: "https://www.datacenterdynamics.com/en/news/oracleopenai-drop-plans-to-expand-flagship-abilene-stargate-site-meta-in-talks-to-pick-up-crusoe-capacity-with-nvidias-help/", title: "Oracle/OpenAI drop Abilene-2 expansion", type: "news" }, { url: "https://www.tomshardware.com/tech-industry/oracle-and-openai-scrap-planned-600mw-abilene-expansion", title: "Tom's Hardware: scrapped expansion", type: "news" }], notes: "Expansion cancelled — capex needs source verification" },

  // CORRECTED: Original $6B was funding round, not capex. Real Memphis capex ~$18B per SemiAnalysis/Sherwood
  { datacenterSlug: "xai-colossus-memphis", capexUsd: 18_000_000_000, sources: [{ url: "https://newsletter.semianalysis.com/p/xais-colossus-2-first-gigawatt-datacenter", title: "xAI Colossus 2 — first gigawatt datacenter", type: "news" }, { url: "https://sherwood.news/tech/musks-xai-spending-usd18-billion-for-another-300-000-nvidia-gpus-for/", title: "Sherwood: $18B for 300k Nvidia GPUs", type: "news" }, { url: "https://www.datacenterdynamics.com/en/news/xai-confirms-new-data-center-in-mississippi-elon-musk-pledges-20bn-investment-in-state/", title: "DCD: xAI Mississippi $20B", type: "news" }] },

  // VERIFIED: $10B Hyperion announcement Dec 2024
  { datacenterSlug: "meta-hyperion-richland", capexUsd: 10_000_000_000, sources: [{ url: "https://www.opportunitylouisiana.gov/news/meta-selects-northeast-louisiana-as-site-of-10-billion-artificial-intelligence-optimized-data-center-governor-jeff-landry-calls-investment-a-new-chapter-for-state", title: "Louisiana ED: Meta $10B Hyperion", type: "pr" }, { url: "https://www.datacenterfrontier.com/hyperscale/article/55248311/meta-sees-10b-ai-data-center-in-louisiana-using-combo-of-clean-energy-nuclear-power", title: "DCF: Meta $10B Louisiana", type: "news" }] },

  // CORRECTED: cumulative $2.5B+ (DCD, AltoonaNow); original 1.5B understated. Slug corrected from meta-altoona-ia.
  { datacenterSlug: "meta-altoona", capexUsd: 2_500_000_000, sources: [{ url: "https://www.datacenterdynamics.com/en/news/metafacebook-announces-another-altoona-campus-expansion/", title: "DCD: Meta Altoona expansion", type: "news" }, { url: "https://altoonanow.org/altoona-site-will-be-metas-largest-data-center-in-the-world-by-2025-company-announces/", title: "AltoonaNow: largest in world by 2025", type: "news" }] },

  // CORRECTED: cumulative $1.5B (Deseret + DCD 2022 expansion). Original $800M was just Phase-1.
  { datacenterSlug: "meta-eagle-mountain", capexUsd: 1_500_000_000, sources: [{ url: "https://www.deseret.com/utah/2022/9/30/23380151/facebook-meta-announces-expansion-eagle-mountain-data-center-tax-breaks/", title: "Deseret: Eagle Mountain mega expansion", type: "news" }, { url: "https://www.datacenterdynamics.com/en/news/meta-to-expand-eagle-mountain-campus-again/", title: "DCD: Eagle Mountain expansion", type: "news" }] },

  // VERIFIED: $1.5B+ confirmed (DCD, Nebraska Examiner). Slug corrected from meta-sarpy-county.
  { datacenterSlug: "meta-sarpy-papillion", capexUsd: 1_500_000_000, sources: [{ url: "https://www.datacenterdynamics.com/en/news/meta-to-expand-sarpy-data-center-in-nebraska/", title: "DCD: Meta Sarpy expansion", type: "news" }, { url: "https://nebraskaexaminer.com/2022/07/28/facebook-parent-company-meta-continues-growth-in-nebraskas-sarpy-county/", title: "NE Examiner: Sarpy growth", type: "news" }] },

  // CORRECTED: Original $1.5B → $1B per Meta own announcement; Newton/Stanton Springs full build-out "more than $1B"
  { datacenterSlug: "meta-newton-county", capexUsd: 1_000_000_000, sources: [{ url: "https://datacenters.atmeta.com/2021/03/hello-georgia/", title: "Meta: Hello Georgia", type: "operator" }] },

  // CORRECTED: cumulative $1.5B (~€1.4B) per dgtlinfra; original $550M was Phase-1
  { datacenterSlug: "meta-clonee", capexUsd: 1_500_000_000, sources: [{ url: "https://dgtlinfra.com/meta-data-center-locations-facebook/", title: "dgtlinfra: Meta DC locations", type: "other" }, { url: "https://www.siliconrepublic.com/enterprise/facebook-data-centre-clonee-renewable-energy", title: "Silicon Republic: €300M Clonee 100% renewable", type: "news" }] },

  // VERIFIED: cumulative ~$1.5B (Business Sweden 2018 + later expansion). Original about.fb.com URL 404'd.
  { datacenterSlug: "meta-lulea", capexUsd: 1_500_000_000, sources: [{ url: "https://www.business-sweden.com/about-us/media/press-releases/press-releases/2018/facebook-expands-in-lulea---confirming-sweden-as-a-world-class-destination-for-data-centers/", title: "Business Sweden: Facebook expands Luleå", type: "pr" }] },

  // CORRECTED: Odense cumulative DKK 13B (~$2B); original $200M massively understated
  { datacenterSlug: "meta-odense", capexUsd: 2_000_000_000, sources: [{ url: "https://thetechcapital.com/meta-plans-for-2bn-denmark-data-centre-campus/", title: "Tech Capital: Meta $2B Denmark campus", type: "news" }, { url: "https://investindk.com/cases/meta-announces-expansion-of-data-center-in-odense-making-it-the-largest-in-the-world", title: "Invest in DK: Odense largest in world", type: "pr" }] },

  // VERIFIED: $3.3B Mt Pleasant May 2024. Original blogs.microsoft.com URL 404'd.
  { datacenterSlug: "microsoft-mt-pleasant", capexUsd: 3_300_000_000, sources: [{ url: "https://news.microsoft.com/source/2024/05/08/microsoft-announces-3-3-billion-investment-in-wisconsin-to-spur-artificial-intelligence-innovation-and-economic-growth/", title: "Microsoft $3.3B Wisconsin", type: "pr" }] },

  // UNVERIFIED: no discrete Quincy figure attested; lowered from $2B to $1B as rough estimate
  { datacenterSlug: "microsoft-quincy-columbia", capexUsd: 1_000_000_000, sources: [{ url: "https://local.microsoft.com/communities/americas/quincy/", title: "Microsoft Quincy community page", type: "operator" }], notes: "Capex needs source verification — no aggregate Quincy capex published" },

  // CORRECTED: cumulative ~$1B+; URL replaced (news.microsoft.com 404'd)
  { datacenterSlug: "microsoft-san-antonio", capexUsd: 1_000_000_000, sources: [{ url: "https://www.datacenters.com/news/microsoft-s-1-5-billion-data-center-expansion-in-san-antonio", title: "Microsoft $1.5B SA expansion", type: "news" }, { url: "https://www.bisnow.com/national/news/data-center-development/microsoft-project-continues-san-antonio-rise-major-data-center-hub-132675", title: "Bisnow: SA major DC hub", type: "news" }] },

  // CORRECTED: Grange Castle DUB14/15 €900M ≈ $1B at 2022 FX; figure was EUR mistakenly used as USD
  { datacenterSlug: "azure-grange-castle-dublin", capexUsd: 1_000_000_000, sources: [{ url: "https://www.theregister.com/2023/07/22/microsoft_power_plant/", title: "The Register: Microsoft Dublin gas plant", type: "news" }, { url: "https://dublinpeople.com/news/southside/articles/2022/12/14/microsoft-plans-build-gas-power-station-part-of-e900m-data-centre/", title: "Dublin People: €900M Grange Castle", type: "news" }] },

  // VERIFIED: $2.9B Japan announcement April 2024; URL replaced
  { datacenterSlug: "azure-japan-east-tokyo", capexUsd: 2_900_000_000, sources: [{ url: "https://news.microsoft.com/apac/2024/04/10/microsoft-to-invest-us2-9-billion-in-ai-and-cloud-infrastructure-in-japan-while-boosting-the-nations-skills-research-and-cybersecurity/", title: "Microsoft $2.9B Japan", type: "pr" }] },

  // VERIFIED: $7.8B Ohio New Albany; URL replaced (aboutamazon.com 404'd to live aboutamazon)
  { datacenterSlug: "aws-us-east-2-new-albany", capexUsd: 7_800_000_000, sources: [{ url: "https://www.aboutamazon.com/news/aws/aws-continues-to-invest-in-ohio", title: "AWS Ohio investment", type: "operator" }, { url: "https://www.datacenterdynamics.com/en/news/aws-to-invest-78-billion-into-ohio-data-centers/", title: "DCD: AWS $7.8B Ohio", type: "news" }] },

  // VERIFIED: $5B Mexico Querétaro Jan 2025; URL replaced
  { datacenterSlug: "aws-mexico-central-queretaro", capexUsd: 5_000_000_000, sources: [{ url: "https://aws.amazon.com/blogs/aws/now-open-aws-mexico-central-region/", title: "AWS Mexico (Central) launch", type: "operator" }, { url: "https://techcrunch.com/2025/01/14/aws-pledges-to-spend-5b-in-mexico-launches-new-mexico-server-region/", title: "TechCrunch: AWS $5B Mexico", type: "news" }] },

  // CORRECTED: AWS Canada Montreal CA$2.57B ≈ $2B (Public First report); $5B was mistakenly inflated
  { datacenterSlug: "aws-ca-central-1-montreal", capexUsd: 2_000_000_000, sources: [{ url: "https://awscanada.publicfirst.co/", title: "AWS Canada Public First report", type: "other" }, { url: "https://pages.awscloud.com/rs/112-TZM-766/images/GEN_aws-economic-impact-canada_Nov-2021.pdf", title: "AWS Canada economic impact study", type: "operator" }], notes: "Capex needs source verification — CA$2.57B 2016-2021" },

  // CORRECTED: $1.8B per datacenters.google
  { datacenterSlug: "google-the-dalles", capexUsd: 1_800_000_000, sources: [{ url: "https://datacenters.google/locations/oregon/", title: "Google: The Dalles", type: "operator" }, { url: "https://www.datacenterknowledge.com/hyperscalers/google-confirms-600-million-expansion-in-the-dalles", title: "DCK: $600M expansion", type: "news" }] },

  // CORRECTED: cumulative $5.5B (July 2024) + $1B announcement = $6.5B; original $5B understated
  { datacenterSlug: "google-council-bluffs", capexUsd: 6_500_000_000, sources: [{ url: "https://www.datacenterfrontier.com/hyperscale/article/55093750/google-continues-to-invest-in-iowa-with-another-1-billion-planned-for-its-council-bluffs-campus", title: "DCF: Council Bluffs +$1B", type: "news" }, { url: "https://www.wowt.com/2024/07/02/google-investing-another-1-billion-into-council-bluffs-data-center/", title: "WOWT: Google +$1B Council Bluffs", type: "news" }] },

  // CORRECTED: $4.4B per OK DOC (above $2.5B claim)
  { datacenterSlug: "google-mayes-county", capexUsd: 4_400_000_000, sources: [{ url: "https://www.okcommerce.gov/google-investment-in-pryor-okla-reaches-3-billion/", title: "OK DOC: Google Pryor $3B", type: "pr" }, { url: "https://datacenters.google/locations/oklahoma/", title: "Google: Oklahoma", type: "operator" }] },

  // CORRECTED: cumulative $2.2B (1.2B since 2007 + $1B 2026 expansion); original $1.7B understated
  { datacenterSlug: "google-lenoir", capexUsd: 2_200_000_000, sources: [{ url: "https://www.cityoflenoir.com/CivicAlerts.aspx?AID=594", title: "Lenoir: Google $1B NC", type: "pr" }, { url: "https://www.datacenterdynamics.com/en/news/google-pledges-1bn-investment-in-north-carolina-data-centers/", title: "DCD: Google $1B NC", type: "news" }] },

  // CORRECTED: $3B (1.8B by 2018 + $1.3B 2024 portion of SC $9B)
  { datacenterSlug: "google-berkeley-county", capexUsd: 3_000_000_000, sources: [{ url: "https://governor.sc.gov/news/2024-09/google-grows-south-carolina-footprint-new-dorchester-county-operations-expansion", title: "SC Gov: Google grows footprint", type: "pr" }, { url: "https://www.sccommerce.com/news/google-brings-additional-investment-berkeley-county-data-center", title: "SC Commerce: Google Berkeley", type: "pr" }] },

  // CORRECTED: cumulative ~€1.7B ≈ $1.6B
  { datacenterSlug: "google-eemshaven", capexUsd: 1_600_000_000, sources: [{ url: "https://nltimes.nl/2024/04/24/google-invest-eu600-million-fourth-data-center-netherlands", title: "NL Times: Google +€600M Netherlands", type: "news" }, { url: "https://www.datacenterknowledge.com/hyperscalers/google-to-spend-1-1-billion-on-new-data-centers-in-netherlands", title: "DCK: $1.1B NL DCs", type: "news" }] },

  // CORRECTED: cumulative ~€4.5B ≈ $4.8B (€3.5B since 2009 + €1B 2024); original $2B understated
  { datacenterSlug: "google-hamina", capexUsd: 4_800_000_000, sources: [{ url: "https://www.businessfinland.fi/en/whats-new/news/2024/google-announced-an-expansion-of-its-hamina-data-center", title: "BusinessFinland: Google Hamina", type: "pr" }, { url: "https://www.datacenter-forum.com/google/google-to-invests-1-billion-euros-in-finnish-data-centre", title: "DC Forum: €1B Finland", type: "news" }] },

  // CORRECTED: cumulative >€11B ≈ $11B per blog.google Oct 2025; original $1.2B way under
  { datacenterSlug: "google-saint-ghislain", capexUsd: 11_000_000_000, sources: [{ url: "https://blog.google/innovation-and-ai/infrastructure-and-cloud/global-network/google-ai-infrastructure-investment-belgium/", title: "Google: €5B AI Belgium", type: "operator" }, { url: "https://www.googlecloudpresscorner.com/2025-10-07-Google-Announces-New-EUR5-Billion-AI-Infrastructure-Investment-in-Belgium-through-2027", title: "Google Cloud: €5B Belgium 2027", type: "pr" }] },

  // VERIFIED: €600M ≈ $686M (DCD, Copenhagen Economics)
  { datacenterSlug: "google-fredericia", capexUsd: 686_000_000, sources: [{ url: "https://www.datacenterdynamics.com/en/news/google-build-690m-data-center-fredericia-denmark/", title: "DCD: Google $690M Fredericia", type: "news" }, { url: "https://blog.google/inside-google/infrastructure/breaking-ground-googles-first-data-center-denmark/", title: "Google: breaking ground Denmark", type: "operator" }] },

  // CORRECTED: Phase 1 €600M ≈ $650M; original $2B reflected hypothetical multi-phase ceiling
  { datacenterSlug: "google-skien", capexUsd: 650_000_000, sources: [{ url: "https://www.datacenterdynamics.com/en/news/google-breaks-ground-on-norway-data-center/", title: "DCD: Google Norway groundbreaking", type: "news" }, { url: "https://www.itpro.com/infrastructure/data-centres/google-breaks-ground-on-its-first-norwegian-data-center-as-tech-giant-targets-99-carbon-free-operations", title: "ITPro: Google Norway 99% carbon-free", type: "news" }] },

  // VERIFIED: $1B UK Waltham Cross Jan 2024
  { datacenterSlug: "google-london-europe-west2", capexUsd: 1_000_000_000, sources: [{ url: "https://www.googlecloudpresscorner.com/2024-01-18-Google-to-Invest-1-Billion-in-United-Kingdom-Data-Centre", title: "Google Cloud: $1B UK", type: "pr" }, { url: "https://www.euronews.com/business/2024/01/19/google-invests-1-billion-in-london-based-data-centre", title: "Euronews: $1B London", type: "news" }] },

  // VERIFIED: $20B Stargate UAE 1GW
  { datacenterSlug: "g42-stargate-uae-abu-dhabi", capexUsd: 20_000_000_000, sources: [{ url: "https://openai.com/index/introducing-stargate-uae/", title: "OpenAI: Stargate UAE", type: "operator" }, { url: "https://www.g42.ai/resources/news/global-tech-alliance-launches-stargate-uae", title: "G42: Stargate UAE", type: "pr" }, { url: "https://www.thenationalnews.com/future/technology/2025/05/22/abu-dhabis-g42-teams-up-with-big-tech-companies-to-build-stargate-uae/", title: "The National: G42 Stargate UAE", type: "news" }] },

  // VERIFIED: $10B Saudi PIF HUMAIN
  { datacenterSlug: "humain-saudi-riyadh", capexUsd: 10_000_000_000, sources: [{ url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2025/hrh-crown-prince-launches-humain-as-global-ai-powerhouse/", title: "PIF: HUMAIN launch", type: "pr" }, { url: "https://www.cnbc.com/2025/08/27/saudi-arabia-wants-to-be-worlds-third-largest-ai-provider-humain.html", title: "CNBC: HUMAIN billions in DCs", type: "news" }] },

  // CORRECTED: Reliance Jamnagar $20-30B range; original $5B significantly understated
  { datacenterSlug: "reliance-jio-jamnagar-ai", capexUsd: 20_000_000_000, sources: [{ url: "https://www.lightreading.com/data-centers/india-s-reliance-is-building-massive-3gw-data-center-report", title: "LightReading: Reliance 3GW", type: "news" }, { url: "https://www.datacenterdynamics.com/en/news/reliance-industries-to-build-gw-scale-ai-data-center-in-gujurat-india/", title: "DCD: Reliance GW-scale Gujarat", type: "news" }] },

  // VERIFIED: $4.3B YTL/Nvidia AI park
  { datacenterSlug: "ytl-yondr-johor-kulai", capexUsd: 4_300_000_000, sources: [{ url: "https://www.datacenterdynamics.com/en/news/nvidia-ytl-power-partner-for-43bn-ai-data-centers-in-malaysia/", title: "DCD: Nvidia/YTL $4.3B Malaysia", type: "news" }, { url: "https://www.investkl.gov.my/insights/content-library/relevant-news/nvidia-to-partner-malaysia39s-ytl-power-in-43-bln-ai-development-project", title: "InvestKL: Nvidia/YTL $4.3B", type: "pr" }] },

  // CORRECTED: $270M latest committed Phase II loan; original $650M not concretely attested
  { datacenterSlug: "naver-sejong-gak", capexUsd: 270_000_000, sources: [{ url: "https://www.datacenterdynamics.com/en/news/naver-secures-270m-loan-for-ai-data-center-in-sejong-south-korea/", title: "DCD: Naver $270M Sejong loan", type: "news" }, { url: "https://en.sedaily.com/news/2026/04/15/national-growth-fund-to-provide-400-billion-won-low", title: "SeDaily: KRW 400B loan", type: "news" }], notes: "Capex needs source verification — total campus larger than $270M loan figure" },

  // CORRECTED: Plano $1.6B per local press (not $1.2B Chirisa stub which referred to Denton/NJ)
  { datacenterSlug: "coreweave-plano", capexUsd: 1_600_000_000, sources: [{ url: "https://www.localprofile.com/news/1-6-billion-data-center-plano-7506948", title: "Local Profile: $1.6B Plano DC", type: "news" }, { url: "https://www.prnewswire.com/news-releases/coreweave-opens-new-texas-data-center-to-expand-access-to-high-performance-gpus-301884897.html", title: "PR: CoreWeave Plano launch", type: "pr" }] },
];
