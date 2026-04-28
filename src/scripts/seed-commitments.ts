/**
 * Seed renewable / carbon-free commitments for top operators and suppliers.
 *
 * Populates `app.brand.commitment_renewable_pct`, `commitment_target_year`,
 * `commitment_source_url`, and `commitment_notes`. Idempotent: re-running
 * overwrites with the seed values (community can dispute via findings).
 *
 * Usage:
 *   pnpm commitments:seed
 *
 * NOTE: Treat as starter data. Notes distinguish "renewable matched" (most
 * hyperscalers) from "24/7 carbon-free" (Google's stricter target) and flag
 * methodology disputes (e.g. Crusoe gas-flare-capture).
 */

import { db } from "@/server/db";
import { brands } from "@/server/db/schema";
import { eq } from "drizzle-orm";

type Commitment = {
  slug: string;
  pct: number;
  year: number;
  url: string;
  notes?: string;
};

const COMMITMENTS: Commitment[] = [
  // ─── Hyperscalers (original 13) ───
  {
    slug: "microsoft",
    pct: 100,
    year: 2025,
    url: "https://blogs.microsoft.com/blog/2020/01/16/microsoft-will-be-carbon-negative-by-2030/",
    notes: "100% renewable matched by 2025; carbon-negative by 2030; SBTi-validated",
  },
  {
    slug: "google",
    pct: 100,
    year: 2030,
    url: "https://sustainability.google/operating-sustainably/",
    notes: "24/7 carbon-free energy by 2030 (stricter than mere renewable matching); RE100 member",
  },
  {
    slug: "meta",
    pct: 100,
    year: 2020,
    url: "https://sustainability.atmeta.com/our-actions/net-zero/",
    notes: "100% renewable matched since 2020; net-zero across value chain by 2030; RE100 member",
  },
  {
    slug: "aws",
    pct: 100,
    year: 2025,
    url: "https://sustainability.aboutamazon.com/climate-solutions/the-climate-pledge",
    notes: "Amazon Climate Pledge: 100% renewable by 2025 (achieved 2023); net-zero 2040",
  },
  {
    slug: "apple",
    pct: 100,
    year: 2020,
    url: "https://www.apple.com/environment/",
    notes: "100% renewable across operations achieved 2020; carbon-neutral supply chain by 2030",
  },
  {
    slug: "oracle",
    pct: 100,
    year: 2025,
    url: "https://www.oracle.com/sustainability/",
    notes: "100% renewable for cloud regions by 2025; SBTi-validated near-term targets",
  },
  {
    slug: "alibaba-cloud",
    pct: 100,
    year: 2030,
    url: "https://www.alibabagroup.com/document/Alibaba-ESG-Report-FY2024.pdf",
    notes: "Alibaba Group carbon-neutral operations by 2030; data centers central to plan",
  },
  {
    slug: "digital-realty",
    pct: 100,
    year: 2030,
    url: "https://www.digitalrealty.com/about/sustainability",
    notes: "100% renewable electricity by 2030; SBTi-validated 1.5C; iMasons Climate Accord",
  },
  {
    slug: "equinix",
    pct: 100,
    year: 2030,
    url: "https://www.equinix.com/about/sustainability",
    notes: "100% renewable by 2030 (~96% achieved 2023); climate-neutral by 2030; RE100 member",
  },
  {
    slug: "ovhcloud",
    pct: 100,
    year: 2025,
    url: "https://corporate.ovhcloud.com/en/sustainability/",
    notes: "Net-zero scope 1+2 by 2025; uses watercooling to reduce energy intensity",
  },
  {
    slug: "openai",
    pct: 0,
    year: 0,
    url: "https://openai.com/",
    notes: "No public clean-energy commitment; defers to Microsoft/Oracle infra partners",
  },
  {
    slug: "xai",
    pct: 0,
    year: 0,
    url: "https://x.ai/",
    notes: "No public clean-energy commitment; Memphis Colossus uses on-site gas turbines",
  },
  {
    slug: "coreweave",
    pct: 0,
    year: 0,
    url: "https://www.coreweave.com/",
    notes: "No quantified renewable/net-zero commitment as of 2026-04",
  },

  // ─── Hyperscaler-tier suppliers ───
  {
    slug: "ibm",
    pct: 100,
    year: 2030,
    url: "https://www.ibm.com/impact/be-equal/pdf/IBM_Impact_Report_2023.pdf",
    notes: "Net-zero GHG by 2030; 75% renewable by 2025, 90% by 2030",
  },
  {
    slug: "nvidia",
    pct: 100,
    year: 2025,
    url: "https://www.nvidia.com/en-us/sustainability/",
    notes: "100% renewable for global operations achieved FY2025; SBTi-validated",
  },
  {
    slug: "supermicro",
    pct: 0,
    year: 0,
    url: "https://www.supermicro.com/en/about/sustainability",
    notes: "Publishes ESG report but no quantified renewable/net-zero target",
  },
  {
    slug: "foxconn",
    pct: 100,
    year: 2050,
    url: "https://www.honhai.com/en-us/csr/sustainable-environment",
    notes: "Net-zero by 2050; SBTi 1.5C; RE100 member targeting 100% renewable by 2040",
  },

  // ─── Major colos ───
  {
    slug: "ntt",
    pct: 100,
    year: 2040,
    url: "https://group.ntt/en/csr/sustainability/environment/",
    notes: "NTT Group net-zero by FY2040; data center business net-zero by FY2030",
  },
  {
    slug: "cyrusone",
    pct: 100,
    year: 2040,
    url: "https://cyrusone.com/sustainability/",
    notes: "Net-zero by 2040; SBTi-validated; commitment maintained post-KKR/GIP take-private",
  },
  {
    slug: "vantage",
    pct: 100,
    year: 2030,
    url: "https://vantage-dc.com/sustainability/",
    notes: "100% renewable matching across global portfolio; net-zero target 2030",
  },
  {
    slug: "qts",
    pct: 100,
    year: 2025,
    url: "https://www.qtsdatacenters.com/sustainability",
    notes: "100% renewable matched since 2021; pre-Blackstone commitment maintained",
  },
  {
    slug: "aligned",
    pct: 100,
    year: 2024,
    url: "https://www.aligneddc.com/sustainability/",
    notes: "100% renewable matched globally; iMasons Climate Accord signatory",
  },
  {
    slug: "iron-mountain",
    pct: 100,
    year: 2017,
    url: "https://www.ironmountain.com/about-us/corporate-responsibility/environment",
    notes: "Iron Mountain DCs 100% renewable since 2017; RE100; targeting 24/7 carbon-free by 2040",
  },
  {
    slug: "cologix",
    pct: 100,
    year: 2030,
    url: "https://www.cologix.com/about/sustainability/",
    notes: "100% renewable goal across portfolio; iMasons Climate Accord",
  },
  {
    slug: "stack-infrastructure",
    pct: 100,
    year: 2030,
    url: "https://www.stackinfra.com/sustainability/",
    notes: "100% renewable matching; iMasons Climate Accord signatory",
  },
  {
    slug: "compass-datacenters",
    pct: 100,
    year: 2030,
    url: "https://www.compassdatacenters.com/sustainability/",
    notes: "Carbon-neutral operations target; iMasons Climate Accord",
  },
  {
    slug: "switch",
    pct: 100,
    year: 2016,
    url: "https://www.switch.com/sustainability/",
    notes: "100% renewable since 2016; first colo to achieve; RE100 member",
  },

  // ─── Asian cloud / sovereign ───
  {
    slug: "tencent-cloud",
    pct: 100,
    year: 2030,
    url: "https://www.tencent.com/en-us/responsibility/sustainability.html",
    notes: "Tencent Group carbon-neutral operations + supply chain by 2030; 100% renewable own ops by 2030",
  },
  {
    slug: "baidu-cloud",
    pct: 100,
    year: 2030,
    url: "https://esg.baidu.com/",
    notes: "Baidu Group carbon-neutral operations by 2030",
  },
  {
    slug: "naver",
    pct: 100,
    year: 2040,
    url: "https://www.navercorp.com/en/naver/sustainabilityReport",
    notes: "Naver carbon-negative by 2040; 60% renewable by 2030 milestone",
  },
  {
    slug: "softbank",
    pct: 100,
    year: 2030,
    url: "https://group.softbank/en/sustainability/environment",
    notes: "SoftBank Group net-zero GHG by 2030; SBTi-validated 1.5C",
  },
  {
    slug: "ytl",
    pct: 100,
    year: 2050,
    url: "https://www.ytl.com/sustainability.asp",
    notes: "YTL Group net-zero by 2050; YTL Power solar projects supply Johor DC campus",
  },
  {
    slug: "yotta",
    pct: 0,
    year: 0,
    url: "https://yottainfrastructure.com/",
    notes: "No public clean-energy commitment as of 2026-04",
  },
  {
    slug: "humain",
    pct: 0,
    year: 0,
    url: "https://humain.ai/",
    notes: "No public clean-energy commitment; PIF-owned Saudi sovereign AI firm launched 2025",
  },
  {
    slug: "g42",
    pct: 0,
    year: 0,
    url: "https://www.g42.ai/",
    notes: "No quantified target; partners with Masdar on some clean-energy projects",
  },
  {
    slug: "21vianet",
    pct: 100,
    year: 2030,
    url: "https://www.21vianet.com/about/esg",
    notes: "VNET Group carbon-neutral operations by 2030; renewable PPA expansion across China DCs",
  },
  {
    slug: "adaniconnex",
    pct: 100,
    year: 2030,
    url: "https://www.adaniconnex.com/sustainability",
    notes: "100% renewable target; backed by Adani Green Energy capacity",
  },

  // ─── Crypto-to-AI converters ───
  {
    slug: "iris-energy",
    pct: 100,
    year: 2021,
    url: "https://irisenergy.co/sustainability/",
    notes: "IREN claims 100% renewable from grid since inception (BC hydro + TX wind)",
  },
  {
    slug: "applied-digital",
    pct: 0,
    year: 0,
    url: "https://www.applieddigital.com/",
    notes: "Markets ND grid mix (~30% wind) without firm 100% pledge",
  },
  {
    slug: "hut-8",
    pct: 0,
    year: 0,
    url: "https://hut8.com/sustainability/",
    notes: "Reports per-site grid mix; no firm 100%/net-zero target",
  },
  {
    slug: "terawulf",
    pct: 91,
    year: 2024,
    url: "https://www.terawulf.com/sustainability",
    notes: "Reports >91% zero-carbon mix (Susquehanna nuclear + NY hydro); no formal 100% pledge",
  },
  {
    slug: "galaxy-digital",
    pct: 0,
    year: 0,
    url: "https://www.galaxy.com/",
    notes: "No public clean-energy commitment for Helios TX AI/HPC build",
  },
  {
    slug: "riot-platforms",
    pct: 0,
    year: 0,
    url: "https://www.riotplatforms.com/sustainability",
    notes: "Reports ERCOT grid mix; no firm renewable/net-zero target",
  },

  // ─── AI-native / neoclouds ───
  {
    slug: "crusoe",
    pct: 0,
    year: 0,
    url: "https://www.crusoe.ai/climate/",
    notes: "No formal target; markets gas-flare-capture as lower-carbon vs grid; methodology disputed",
  },
  {
    slug: "nebius",
    pct: 0,
    year: 0,
    url: "https://nebius.com/",
    notes: "No public commitment since Yandex spin-out 2024; Finland site benefits from Nordic grid",
  },
  {
    slug: "atnorth",
    pct: 100,
    year: 2020,
    url: "https://www.atnorth.com/sustainability",
    notes: "Iceland/Nordics ops claim 100% renewable via grid mix (geothermal/hydro)",
  },
  {
    slug: "verne",
    pct: 100,
    year: 2020,
    url: "https://verneglobal.com/sustainability/",
    notes: "Iceland ops on 100% renewable hydro/geothermal grid; acquired by Ardian 2024",
  },
  {
    slug: "hydro66",
    pct: 100,
    year: 2015,
    url: "https://www.hydro66.com/sustainability",
    notes: "100% hydro since launch in northern Sweden (Boden)",
  },

  // ─── EU operators ───
  {
    slug: "scaleway",
    pct: 100,
    year: 2017,
    url: "https://www.scaleway.com/en/environmental-leadership/",
    notes: "100% renewable since 2017; net-zero by 2030; published carbon calculator",
  },
  {
    slug: "data4",
    pct: 100,
    year: 2030,
    url: "https://www.data4group.com/en/sustainability/",
    notes: "DATA4 net-zero scopes 1-3 by 2030; 100% renewable since 2022",
  },
  {
    slug: "telefonica",
    pct: 100,
    year: 2025,
    url: "https://www.telefonica.com/en/sustainability-innovation/environment/",
    notes: "100% renewable globally by 2025; net-zero by 2040; SBTi-validated",
  },

  // ─── Suppliers ───
  {
    slug: "vertiv",
    pct: 100,
    year: 2035,
    url: "https://www.vertiv.com/en-us/about/sustainability/",
    notes: "Net-zero scope 1+2 by 2035; SBTi-validated near-term targets",
  },
  {
    slug: "caterpillar",
    pct: 0,
    year: 0,
    url: "https://www.caterpillar.com/en/company/sustainability.html",
    notes: "No firm enterprise-wide net-zero target; intensity-based GHG goals only",
  },
  {
    slug: "cummins",
    pct: 100,
    year: 2050,
    url: "https://www.cummins.com/company/esg/environment",
    notes: "Destination Zero: net-zero by 2050; 100% renewable electricity by 2030",
  },
  {
    slug: "schneider-electric",
    pct: 100,
    year: 2030,
    url: "https://www.se.com/ww/en/about-us/sustainability/",
    notes: "Net-zero ops by 2030; supply chain by 2050; SBTi 1.5C; RE100",
  },
];

async function main() {
  let updated = 0;
  let skipped = 0;
  for (const c of COMMITMENTS) {
    const [row] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, c.slug))
      .limit(1);
    if (!row) {
      console.warn(`  no brand: ${c.slug}`);
      skipped++;
      continue;
    }
    await db
      .update(brands)
      .set({
        commitmentRenewablePct: c.pct || null,
        commitmentTargetYear: c.year || null,
        commitmentSourceUrl: c.url || null,
        commitmentNotes: c.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(brands.slug, c.slug));
    updated++;
    console.log(`  ${c.slug}: ${c.pct}% by ${c.year || "—"}`);
  }
  console.log(`Updated ${updated}, skipped ${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
