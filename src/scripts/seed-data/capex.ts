import type { DatacenterSource } from "@/server/db/schema";

export type CapexUpdate = {
  datacenterSlug: string;
  capexUsd: number;
  sources: DatacenterSource[];
};

export const CAPEX_UPDATES: CapexUpdate[] = [
  { datacenterSlug: "stargate-abilene", capexUsd: 15_000_000_000, sources: [{ url: "https://openai.com/index/announcing-the-stargate-project/", title: "Announcing The Stargate Project", type: "pr" }, { url: "https://www.reuters.com/technology/artificial-intelligence/openai-oracle-softbank-launch-stargate-ai-infrastructure-project-2025-01-21/", title: "OpenAI/Oracle/SoftBank Stargate", type: "news" }] },
  { datacenterSlug: "oracle-stargate-abilene-2", capexUsd: 10_000_000_000, sources: [{ url: "https://www.bloomberg.com/news/articles/2025-03-06/", title: "Crusoe secures $15B for Abilene expansion", type: "news" }] },
  { datacenterSlug: "xai-colossus-memphis", capexUsd: 6_000_000_000, sources: [{ url: "https://www.reuters.com/technology/artificial-intelligence/musks-xai-raises-6-billion-funding-bring-ai-products-market-2024-12-23/", title: "Musk's xAI raises $6B", type: "news" }] },
  { datacenterSlug: "meta-hyperion-richland", capexUsd: 10_000_000_000, sources: [{ url: "https://about.fb.com/news/2024/12/meta-louisiana-data-center/", title: "Meta Louisiana data center announcement", type: "pr" }, { url: "https://www.reuters.com/technology/meta-build-10-billion-ai-data-center-louisiana-2024-12-04/", title: "Meta to build $10B AI data center in Louisiana", type: "news" }] },
  { datacenterSlug: "meta-altoona", capexUsd: 1_500_000_000, sources: [{ url: "https://about.fb.com/news/2022/04/altoona-data-center-expansion/", title: "Meta Altoona expansion", type: "pr" }] },
  { datacenterSlug: "meta-eagle-mountain", capexUsd: 800_000_000, sources: [{ url: "https://about.fb.com/news/2018/05/eagle-mountain-data-center/", title: "Meta Eagle Mountain announcement", type: "pr" }] },
  { datacenterSlug: "meta-sarpy-county", capexUsd: 1_500_000_000, sources: [{ url: "https://about.fb.com/news/2019/04/papillion-data-center/", title: "Meta Papillion expansion", type: "pr" }] },
  { datacenterSlug: "meta-newton-county", capexUsd: 1_500_000_000, sources: [{ url: "https://about.fb.com/news/2018/03/newton-county-data-center/", title: "Meta Newton County (Stanton Springs)", type: "pr" }] },
  { datacenterSlug: "meta-clonee", capexUsd: 550_000_000, sources: [{ url: "https://about.fb.com/news/2016/01/clonee-data-center/", title: "Meta Clonee data center", type: "pr" }] },
  { datacenterSlug: "meta-lulea", capexUsd: 1_500_000_000, sources: [{ url: "https://about.fb.com/news/2018/03/expanding-lulea/", title: "Meta Luleå expansion", type: "pr" }] },
  { datacenterSlug: "meta-odense", capexUsd: 200_000_000, sources: [{ url: "https://about.fb.com/news/2017/01/odense-data-center/", title: "Meta Odense announcement", type: "pr" }] },
  { datacenterSlug: "microsoft-mt-pleasant", capexUsd: 3_300_000_000, sources: [{ url: "https://blogs.microsoft.com/blog/2024/05/08/3-3-billion-investment-to-expand-cloud-and-ai-infrastructure-and-skilling-in-wisconsin/", title: "Microsoft $3.3B Wisconsin investment", type: "pr" }] },
  { datacenterSlug: "microsoft-quincy-columbia", capexUsd: 2_000_000_000, sources: [{ url: "https://news.microsoft.com/source/features/sustainability/", title: "Microsoft Quincy data center", type: "operator" }] },
  { datacenterSlug: "microsoft-san-antonio", capexUsd: 1_000_000_000, sources: [{ url: "https://news.microsoft.com/2020/09/30/microsoft-to-expand-data-center-presence-in-san-antonio/", title: "Microsoft San Antonio expansion", type: "pr" }] },
  { datacenterSlug: "azure-grange-castle-dublin", capexUsd: 900_000_000, sources: [{ url: "https://news.microsoft.com/en-ie/2022/06/22/microsoft-announces-data-centre-extension-in-grange-castle/", title: "Grange Castle extension €900M", type: "pr" }] },
  { datacenterSlug: "azure-japan-east-tokyo", capexUsd: 2_900_000_000, sources: [{ url: "https://blogs.microsoft.com/blog/2024/04/09/expanding-microsofts-skilling-cloud-and-ai-investments-in-japan/", title: "Microsoft $2.9B Japan investment", type: "pr" }] },
  { datacenterSlug: "aws-us-east-2-new-albany", capexUsd: 7_800_000_000, sources: [{ url: "https://www.aboutamazon.com/news/aws/aws-ohio-data-center-investment", title: "AWS $7.8B Ohio investment", type: "pr" }, { url: "https://www.reuters.com/technology/aws-invest-78-billion-ohio-data-centers-2024-04-15/", title: "AWS to invest $7.8B in Ohio", type: "news" }] },
  { datacenterSlug: "aws-mexico-central-queretaro", capexUsd: 5_000_000_000, sources: [{ url: "https://www.aboutamazon.com/news/aws/aws-cloud-region-mexico", title: "AWS $5B Mexico region", type: "pr" }] },
  { datacenterSlug: "aws-ca-central-1-montreal", capexUsd: 5_000_000_000, sources: [{ url: "https://www.aboutamazon.com/news/aws/aws-canada-investment-quebec", title: "AWS C$5B Quebec investment", type: "pr" }] },
  { datacenterSlug: "google-the-dalles", capexUsd: 2_000_000_000, sources: [{ url: "https://blog.google/inside-google/infrastructure/the-dalles-data-center-expansion/", title: "Google The Dalles ~$2B+", type: "operator" }] },
  { datacenterSlug: "google-council-bluffs", capexUsd: 5_000_000_000, sources: [{ url: "https://blog.google/inside-google/infrastructure/iowa-data-center-expansion/", title: "Google Council Bluffs ~$5B+", type: "operator" }] },
  { datacenterSlug: "google-mayes-county", capexUsd: 2_500_000_000, sources: [{ url: "https://blog.google/inside-google/infrastructure/oklahoma-google-data-center-expansion/", title: "Google Mayes County (Pryor)", type: "operator" }] },
  { datacenterSlug: "google-lenoir", capexUsd: 1_700_000_000, sources: [{ url: "https://blog.google/inside-google/infrastructure/lenoir-nc-data-center/", title: "Google Lenoir NC ~$1.7B", type: "operator" }] },
  { datacenterSlug: "google-berkeley-county", capexUsd: 1_500_000_000, sources: [{ url: "https://blog.google/inside-google/infrastructure/berkeley-county-sc-data-center/", title: "Google Berkeley County SC ~$1.5B", type: "operator" }] },
  { datacenterSlug: "google-eemshaven", capexUsd: 1_100_000_000, sources: [{ url: "https://blog.google/around-the-globe/google-europe/eemshaven-data-center-expansion/", title: "Google Eemshaven NL ~€1B+", type: "operator" }] },
  { datacenterSlug: "google-hamina", capexUsd: 2_000_000_000, sources: [{ url: "https://blog.google/around-the-globe/google-europe/hamina-data-center-expansion/", title: "Google Hamina FI >€2B", type: "operator" }] },
  { datacenterSlug: "google-saint-ghislain", capexUsd: 1_200_000_000, sources: [{ url: "https://blog.google/around-the-globe/google-europe/saint-ghislain-data-center/", title: "Google Saint-Ghislain ~€1.2B", type: "operator" }] },
  { datacenterSlug: "google-fredericia", capexUsd: 700_000_000, sources: [{ url: "https://blog.google/around-the-globe/google-europe/fredericia-data-center/", title: "Google Fredericia DKK 4.5B", type: "operator" }] },
  { datacenterSlug: "google-skien", capexUsd: 2_000_000_000, sources: [{ url: "https://blog.google/around-the-globe/google-europe/google-data-center-norway-skien/", title: "Google Skien planned $2B", type: "operator" }] },
  { datacenterSlug: "google-london-europe-west2", capexUsd: 1_000_000_000, sources: [{ url: "https://blog.google/around-the-globe/google-europe/uk/google-uk-investment/", title: "Google $1B UK investment", type: "pr" }, { url: "https://www.reuters.com/technology/google-invest-1-billion-new-uk-data-centre-2024-01-18/", title: "Google to invest $1B in new UK data centre", type: "news" }] },
  { datacenterSlug: "g42-stargate-uae-abu-dhabi", capexUsd: 20_000_000_000, sources: [{ url: "https://www.reuters.com/world/middle-east/uae-launches-stargate-ai-campus-with-openai-oracle-2025-05-15/", title: "UAE Stargate 1GW campus", type: "news" }, { url: "https://openai.com/index/introducing-stargate-uae/", title: "Introducing Stargate UAE", type: "pr" }] },
  { datacenterSlug: "humain-saudi-riyadh", capexUsd: 10_000_000_000, sources: [{ url: "https://www.reuters.com/technology/saudi-arabia-launches-humain-ai-company-pif-2025-05-12/", title: "Saudi PIF launches HUMAIN", type: "news" }] },
  { datacenterSlug: "reliance-jio-jamnagar-ai", capexUsd: 5_000_000_000, sources: [{ url: "https://www.reuters.com/world/india/india-reliance-build-3-gw-data-center-jamnagar-2024-10-15/", title: "Reliance to build 3GW AI DC in Jamnagar", type: "news" }] },
  { datacenterSlug: "ytl-yondr-johor-kulai", capexUsd: 4_300_000_000, sources: [{ url: "https://www.reuters.com/technology/malaysias-ytl-nvidia-build-43-billion-ai-data-center-park-2023-12-08/", title: "YTL/NVIDIA $4.3B AI DC park", type: "news" }] },
  { datacenterSlug: "naver-sejong-gak", capexUsd: 650_000_000, sources: [{ url: "https://www.navercorp.com/en/promotion/pressReleasesView/30888", title: "Naver GAK Sejong launch", type: "pr" }] },
  { datacenterSlug: "apple-maiden-nc", capexUsd: 1_000_000_000, sources: [{ url: "https://www.apple.com/newsroom/2018/01/apple-accelerates-us-investment-and-job-creation/", title: "Apple Maiden NC >$1B", type: "pr" }] },
  { datacenterSlug: "coreweave-plano", capexUsd: 1_200_000_000, sources: [{ url: "https://www.bloomberg.com/news/articles/2024-06-04/coreweave-signs-1-2-billion-data-center-lease-with-chirisa", title: "CoreWeave $1.2B Chirisa lease", type: "news" }] },
];
