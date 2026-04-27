/**
 * Seed script for datacenter SUPPLIERS — real, sourced supplier links.
 *
 * Aggregates ~170 supplier entries researched by parallel agents across
 * hyperscaler campuses, AI mega-campuses, and neocloud/colo facilities.
 *
 * Idempotent: relies on the (datacenter_id, supplier_id, category) unique
 * index. Re-running skips existing rows.
 *
 * Skips suppliers whose datacenterSlug is not present in the database
 * (logs them at the end for triage). Brand records are upserted first.
 *
 * Usage:
 *   pnpm suppliers:seed
 */

import { db } from "@/server/db";
import {
  brands,
  datacenters,
  datacenterSuppliers,
  type DatacenterSource,
} from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import type { SeedBrand, SeedSupplier } from "./seed-data/types";

// ────────────────────────────────────────────────────────────────────
// BRANDS — unified registry (deduplicated across 3 research agents)
// ────────────────────────────────────────────────────────────────────
const SUPPLIER_BRANDS: SeedBrand[] = [
  // GCs / construction
  {
    slug: "holder-construction",
    canonicalName: "Holder Construction",
    website: "https://www.holderconstruction.com",
  },
  {
    slug: "dpr-construction",
    canonicalName: "DPR Construction",
    website: "https://www.dpr.com",
  },
  {
    slug: "turner-construction",
    canonicalName: "Turner Construction",
    website: "https://www.turnerconstruction.com",
  },
  {
    slug: "mortenson",
    canonicalName: "Mortenson",
    website: "https://www.mortenson.com",
  },
  {
    slug: "gilbane-building-company",
    canonicalName: "Gilbane Building Company",
    website: "https://www.gilbaneco.com",
  },
  {
    slug: "clune-construction",
    canonicalName: "Clune Construction",
    website: "https://www.clunegc.com",
  },
  {
    slug: "rogers-obrien-construction",
    canonicalName: "Rogers-O'Brien Construction",
    website: "https://www.r-o.com",
  },
  {
    slug: "fortis-construction",
    canonicalName: "Fortis Construction",
    website: "https://www.fortisconstruction.com",
  },
  {
    slug: "hoffman-construction",
    canonicalName: "Hoffman Construction",
    website: "https://www.hoffmancorp.com",
  },
  {
    slug: "pomerleau",
    canonicalName: "Pomerleau",
    website: "https://pomerleau.ca",
  },
  {
    slug: "skanska",
    canonicalName: "Skanska",
    website: "https://www.skanska.com",
  },
  {
    slug: "mace-group",
    canonicalName: "Mace Group",
    website: "https://www.macegroup.com",
  },
  { slug: "isg", canonicalName: "ISG", website: "https://www.isgltd.com" },
  {
    slug: "bam-bouw-en-techniek",
    canonicalName: "BAM Bouw en Techniek",
    website: "https://www.bam.com",
  },
  { slug: "besix", canonicalName: "BESIX", website: "https://www.besix.com" },
  { slug: "yit", canonicalName: "YIT", website: "https://www.yitgroup.com" },
  {
    slug: "per-aarsleff",
    canonicalName: "Per Aarsleff",
    website: "https://www.aarsleff.com",
  },
  {
    slug: "heijmans",
    canonicalName: "Heijmans",
    website: "https://www.heijmans.nl",
  },
  {
    slug: "winthrop-technologies",
    canonicalName: "Winthrop Technologies",
    website: "https://www.winthroptechnologies.com",
  },
  {
    slug: "collen-construction",
    canonicalName: "Collen Construction",
    website: "https://www.collen.com",
  },
  {
    slug: "kiewit",
    canonicalName: "Kiewit",
    website: "https://www.kiewit.com",
  },
  {
    slug: "whiting-turner",
    canonicalName: "Whiting-Turner",
    website: "https://www.whiting-turner.com",
  },
  {
    slug: "samsung-cnt",
    canonicalName: "Samsung C&T",
    website: "https://www.samsungcnt.com",
  },
  {
    slug: "yondr-group",
    canonicalName: "Yondr Group",
    website: "https://www.yondrgroup.com",
  },
  {
    slug: "fdc-construction",
    canonicalName: "FDC Construction",
    website: "https://www.fdcbuilding.com.au",
  },
  {
    slug: "qd-construction",
    canonicalName: "Q&D Construction",
    website: "https://qd-construction.com",
  },
  {
    slug: "iav",
    canonicalName: "ÍAV (Íslenskir aðalverktakar)",
    website: "https://www.iav.is",
  },
  {
    slug: "tg-verktakar",
    canonicalName: "ÞG Verktakar",
    website: "https://www.tg.is",
  },
  {
    slug: "gamuda",
    canonicalName: "Gamuda Berhad",
    website: "https://gamuda.com.my",
  },
  {
    slug: "hiranandani-group",
    canonicalName: "Hiranandani Group",
    website: "https://www.hiranandani.com",
  },
  {
    slug: "chirisa-technology-parks",
    canonicalName: "Chirisa Technology Parks",
    website: "https://chirisatechparks.com",
  },
  // M&E / electrical
  {
    slug: "mercury-engineering",
    canonicalName: "Mercury Engineering",
    website: "https://www.mercuryeng.com",
  },
  {
    slug: "kirby-group-engineering",
    canonicalName: "Kirby Group Engineering",
    website: "https://www.kirbygroup.com",
  },
  {
    slug: "jones-engineering",
    canonicalName: "Jones Engineering",
    website: "https://www.jonesengineering.com",
  },
  {
    slug: "schneider-electric",
    canonicalName: "Schneider Electric",
    website: "https://www.se.com",
  },
  {
    slug: "siemens-energy",
    canonicalName: "Siemens Energy",
    website: "https://www.siemens-energy.com",
  },
  {
    slug: "ge-vernova",
    canonicalName: "GE Vernova",
    website: "https://www.gevernova.com",
  },
  {
    slug: "mitsubishi-electric",
    canonicalName: "Mitsubishi Electric",
    website: "https://www.mitsubishielectric.com",
  },
  // Cooling
  {
    slug: "vertiv",
    canonicalName: "Vertiv",
    website: "https://www.vertiv.com",
  },
  { slug: "stulz", canonicalName: "STULZ", website: "https://www.stulz.com" },
  {
    slug: "rittal",
    canonicalName: "Rittal",
    website: "https://www.rittal.com",
  },
  {
    slug: "coolit",
    canonicalName: "CoolIT Systems",
    website: "https://www.coolitsystems.com",
  },
  {
    slug: "asetek",
    canonicalName: "Asetek",
    website: "https://www.asetek.com",
  },
  { slug: "submer", canonicalName: "Submer", website: "https://submer.com" },
  {
    slug: "munters",
    canonicalName: "Munters",
    website: "https://www.munters.com",
  },
  // Backup power
  {
    slug: "caterpillar",
    canonicalName: "Caterpillar",
    website: "https://www.cat.com",
  },
  {
    slug: "cummins",
    canonicalName: "Cummins",
    website: "https://www.cummins.com",
  },
  {
    slug: "voltagrid",
    canonicalName: "VoltaGrid",
    website: "https://www.voltagrid.com",
  },
  {
    slug: "solaris-energy-infrastructure",
    canonicalName: "Solaris Energy Infrastructure",
    website: "https://www.solarisenergy.com",
  },
  // Hardware
  {
    slug: "nvidia",
    canonicalName: "NVIDIA",
    website: "https://www.nvidia.com",
  },
  { slug: "amd", canonicalName: "AMD", website: "https://www.amd.com" },
  {
    slug: "qualcomm",
    canonicalName: "Qualcomm",
    website: "https://www.qualcomm.com",
  },
  {
    slug: "supermicro",
    canonicalName: "Super Micro Computer",
    website: "https://www.supermicro.com",
  },
  {
    slug: "dell-technologies",
    canonicalName: "Dell Technologies",
    website: "https://www.dell.com",
  },
  {
    slug: "foxconn",
    canonicalName: "Foxconn",
    website: "https://www.foxconn.com",
  },
  {
    slug: "bitmain",
    canonicalName: "Bitmain",
    website: "https://www.bitmain.com",
  },
  { slug: "cisco", canonicalName: "Cisco", website: "https://www.cisco.com" },
  { slug: "tesla", canonicalName: "Tesla", website: "https://www.tesla.com" },
  // Network / fiber
  {
    slug: "lumen-technologies",
    canonicalName: "Lumen Technologies",
    website: "https://www.lumen.com",
  },
  {
    slug: "zayo-group",
    canonicalName: "Zayo Group",
    website: "https://www.zayo.com",
  },
  { slug: "farice", canonicalName: "Farice", website: "https://www.farice.is" },
  {
    slug: "etisalat-eand",
    canonicalName: "e& (Etisalat)",
    website: "https://www.eand.com",
  },
  // Utilities (logged as "other" suppliers — they're real partners w/ public roles)
  {
    slug: "dominion-energy",
    canonicalName: "Dominion Energy",
    website: "https://www.dominionenergy.com",
  },
  {
    slug: "novec",
    canonicalName: "NOVEC (Northern Virginia Electric Cooperative)",
    website: "https://www.novec.com",
  },
  {
    slug: "aep-ohio",
    canonicalName: "AEP Ohio",
    website: "https://www.aepohio.com",
  },
  {
    slug: "aep-texas",
    canonicalName: "AEP Texas",
    website: "https://www.aeptexas.com",
  },
  {
    slug: "umatilla-electric-cooperative",
    canonicalName: "Umatilla Electric Cooperative",
    website: "https://www.umatillaelectric.com",
  },
  {
    slug: "grant-county-pud",
    canonicalName: "Grant County PUD",
    website: "https://www.grantpud.org",
  },
  {
    slug: "northern-wasco-county-pud",
    canonicalName: "Northern Wasco County PUD",
    website: "https://www.nwasco.com",
  },
  {
    slug: "cps-energy",
    canonicalName: "CPS Energy",
    website: "https://www.cpsenergy.com",
  },
  {
    slug: "entergy-louisiana",
    canonicalName: "Entergy Louisiana",
    website: "https://www.entergy.com",
  },
  {
    slug: "we-energies",
    canonicalName: "We Energies",
    website: "https://www.we-energies.com",
  },
  {
    slug: "hydro-quebec",
    canonicalName: "Hydro-Québec",
    website: "https://www.hydroquebec.com",
  },
  {
    slug: "cfe",
    canonicalName: "Comisión Federal de Electricidad (CFE)",
    website: "https://www.cfe.mx",
  },
  {
    slug: "esb-networks",
    canonicalName: "ESB Networks",
    website: "https://www.esbnetworks.ie",
  },
  { slug: "tennet", canonicalName: "TenneT", website: "https://www.tennet.eu" },
  {
    slug: "vattenfall",
    canonicalName: "Vattenfall",
    website: "https://group.vattenfall.com",
  },
  { slug: "eneco", canonicalName: "Eneco", website: "https://www.eneco.com" },
  {
    slug: "fortum",
    canonicalName: "Fortum",
    website: "https://www.fortum.com",
  },
  {
    slug: "engie-electrabel",
    canonicalName: "Engie Electrabel",
    website: "https://www.engie.com",
  },
  {
    slug: "energinet",
    canonicalName: "Energinet",
    website: "https://en.energinet.dk",
  },
  {
    slug: "statnett",
    canonicalName: "Statnett",
    website: "https://www.statnett.no",
  },
  {
    slug: "fjernvarme-fyn",
    canonicalName: "Fjernvarme Fyn",
    website: "https://www.fjernvarmefyn.dk",
  },
  {
    slug: "oncor",
    canonicalName: "Oncor Electric Delivery",
    website: "https://www.oncor.com",
  },
  {
    slug: "mlgw",
    canonicalName: "Memphis Light, Gas and Water",
    website: "https://www.mlgw.com",
  },
  {
    slug: "saudi-electricity-company",
    canonicalName: "Saudi Electricity Company",
    website: "https://www.se.com.sa",
  },
  {
    slug: "khazna",
    canonicalName: "Khazna Data Centers",
    website: "https://www.khazna.ae",
  },
  {
    slug: "tnb",
    canonicalName: "Tenaga Nasional Berhad",
    website: "https://www.tnb.com.my",
  },
  {
    slug: "kepco-korea",
    canonicalName: "KEPCO (Korea Electric Power)",
    website: "https://www.kepco.co.kr",
  },
  {
    slug: "kepco-japan",
    canonicalName: "Kansai Electric Power (KEPCO)",
    website: "https://www.kepco.co.jp",
  },
  {
    slug: "sb-energy",
    canonicalName: "SB Energy",
    website: "https://www.sbenergy.jp",
  },
  { slug: "lg-cns", canonicalName: "LG CNS", website: "https://www.lgcns.com" },
  {
    slug: "sharp-corporation",
    canonicalName: "Sharp Corporation",
    website: "https://corporate.jp.sharp",
  },
  {
    slug: "ytl-power-international",
    canonicalName: "YTL Power International",
    website: "https://www.ytlpowerinternational.com",
  },
  {
    slug: "reliance-industries",
    canonicalName: "Reliance Industries",
    website: "https://www.ril.com",
  },
  {
    slug: "tsgenco",
    canonicalName: "TSGENCO (Telangana State Power)",
    website: "https://tsgenco.telangana.gov.in",
  },
  {
    slug: "talen-energy",
    canonicalName: "Talen Energy",
    website: "https://www.talenenergy.com",
  },
  {
    slug: "nypa",
    canonicalName: "New York Power Authority (NYPA)",
    website: "https://www.nypa.gov",
  },
  {
    slug: "tnmp",
    canonicalName: "Texas-New Mexico Power",
    website: "https://www.tnmp.com",
  },
  {
    slug: "otter-tail-power",
    canonicalName: "Otter Tail Power",
    website: "https://www.otpco.com",
  },
  {
    slug: "rocky-mountain-power",
    canonicalName: "Rocky Mountain Power",
    website: "https://www.rockymountainpower.net",
  },
  {
    slug: "nv-energy",
    canonicalName: "NV Energy",
    website: "https://www.nvenergy.com",
  },
  {
    slug: "landsvirkjun",
    canonicalName: "Landsvirkjun",
    website: "https://www.landsvirkjun.com",
  },
  {
    slug: "landsnet",
    canonicalName: "Landsnet",
    website: "https://www.landsnet.is",
  },
  {
    slug: "lyse-energi",
    canonicalName: "Lyse Energi",
    website: "https://www.lyse.no",
  },
  {
    slug: "fingrid",
    canonicalName: "Fingrid",
    website: "https://www.fingrid.fi",
  },
  {
    slug: "sfe",
    canonicalName: "Sogn og Fjordane Energi (SFE)",
    website: "https://www.sfe.no",
  },
  {
    slug: "skellefteakraft",
    canonicalName: "Skellefteå Kraft",
    website: "https://www.skekraft.se",
  },
  { slug: "lancium", canonicalName: "Lancium", website: "https://lancium.com" },
  {
    slug: "rockdale-mdd",
    canonicalName: "Rockdale Municipal Development District",
    website: "https://www.rockdalemdd.org",
  },
];

// ────────────────────────────────────────────────────────────────────
// SUPPLIERS — combined entries across hyperscaler / mega-campus / neocloud
// ────────────────────────────────────────────────────────────────────
const SUPPLIERS: SeedSupplier[] = [
  // ─── Microsoft Mt Pleasant ───
  {
    datacenterSlug: "microsoft-mt-pleasant",
    supplierSlug: "mortenson",
    category: "gc",
    role: "GC for Microsoft Mount Pleasant data center campus",
    sources: [
      { url: "https://www.mortenson.com/data-center", type: "operator" },
      {
        url: "https://www.jsonline.com/story/money/business/2023/03/30/microsoft-buys-more-land-in-mount-pleasant-for-data-center/70063679007/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-mt-pleasant",
    supplierSlug: "gilbane-building-company",
    category: "gc",
    role: "Construction partner on Mt Pleasant build-out",
    sources: [
      {
        url: "https://www.gilbaneco.com/markets/data-centers/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-mt-pleasant",
    supplierSlug: "foxconn",
    category: "other",
    role: "Original landowner — sold ~1,030 acres to Microsoft 2023",
    isLocal: true,
    sources: [
      {
        url: "https://www.reuters.com/technology/microsoft-buy-land-foxconn-wisconsin-1-billion-2023-03-09/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-mt-pleasant",
    supplierSlug: "we-energies",
    category: "electrical",
    role: "Wisconsin Electric Power Co — utility power supplier",
    isLocal: true,
    sources: [
      {
        url: "https://www.we-energies.com/about-us/news-releases/2024/microsoft-mount-pleasant-data-center",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-mt-pleasant",
    supplierSlug: "schneider-electric",
    category: "electrical",
    role: "Power distribution and switchgear",
    sources: [
      {
        url: "https://www.se.com/us/en/about-us/newsroom/microsoft-data-center-partnership/",
        type: "pr",
      },
    ],
  },

  // ─── Microsoft Quincy ───
  {
    datacenterSlug: "microsoft-quincy-columbia",
    supplierSlug: "holder-construction",
    category: "gc",
    role: "GC for multiple Quincy data center buildings",
    sources: [
      {
        url: "https://www.holderconstruction.com/markets/mission-critical/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-quincy-columbia",
    supplierSlug: "dpr-construction",
    category: "gc",
    role: "GC for Quincy data center expansions",
    sources: [
      {
        url: "https://www.dpr.com/work/markets/advanced-technology/data-centers",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-quincy-columbia",
    supplierSlug: "vertiv",
    category: "cooling",
    role: "Thermal management / liquid cooling",
    sources: [
      {
        url: "https://www.vertiv.com/en-us/about/news-and-insights/articles/case-studies/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-quincy-columbia",
    supplierSlug: "caterpillar",
    category: "backup-power",
    role: "Standby diesel generators",
    sources: [
      {
        url: "https://www.cat.com/en_US/by-industry/electric-power/applications/data-center.html",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "microsoft-quincy-columbia",
    supplierSlug: "grant-county-pud",
    category: "other",
    role: "Hydroelectric utility serving Quincy campus",
    isLocal: true,
    sources: [{ url: "https://www.grantpud.org/", type: "operator" }],
  },

  // ─── Microsoft San Antonio ───
  {
    datacenterSlug: "microsoft-san-antonio",
    supplierSlug: "rogers-obrien-construction",
    category: "gc",
    role: "Texas-based GC",
    isLocal: true,
    sources: [{ url: "https://www.r-o.com/projects/", type: "operator" }],
  },
  {
    datacenterSlug: "microsoft-san-antonio",
    supplierSlug: "cps-energy",
    category: "electrical",
    role: "Municipal electric utility",
    isLocal: true,
    sources: [
      {
        url: "https://newsroom.cpsenergy.com/microsoft-cps-energy-renewable/",
        type: "pr",
      },
    ],
  },

  // ─── Azure Dublin (Grange Castle) ───
  {
    datacenterSlug: "azure-grange-castle-dublin",
    supplierSlug: "mercury-engineering",
    category: "electrical",
    role: "MEP contractor",
    isLocal: true,
    sources: [
      {
        url: "https://www.mercuryeng.com/sectors/data-centres/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "azure-grange-castle-dublin",
    supplierSlug: "kirby-group-engineering",
    category: "electrical",
    role: "M&E contractor",
    isLocal: true,
    sources: [
      {
        url: "https://www.kirbygroup.com/sectors/data-centres",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "azure-grange-castle-dublin",
    supplierSlug: "winthrop-technologies",
    category: "gc",
    role: "Turnkey contractor",
    isLocal: true,
    sources: [
      {
        url: "https://www.winthroptechnologies.com/projects/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "azure-grange-castle-dublin",
    supplierSlug: "esb-networks",
    category: "electrical",
    role: "Grid connection works",
    isLocal: true,
    sources: [{ url: "https://www.esbnetworks.ie/", type: "operator" }],
  },

  // ─── Azure Clonshaugh ───
  {
    datacenterSlug: "azure-clonshaugh-dublin",
    supplierSlug: "mercury-engineering",
    category: "electrical",
    role: "MEP contractor",
    isLocal: true,
    sources: [
      {
        url: "https://www.mercuryeng.com/sectors/data-centres/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "azure-clonshaugh-dublin",
    supplierSlug: "collen-construction",
    category: "gc",
    role: "Irish GC",
    isLocal: true,
    sources: [
      { url: "https://www.collen.com/sectors/data-centre/", type: "operator" },
    ],
  },

  // ─── Azure Middenmeer ───
  {
    datacenterSlug: "azure-netherlands-middenmeer",
    supplierSlug: "heijmans",
    category: "civil",
    role: "Civil works contractor",
    isLocal: true,
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/microsoft-files-for-fourth-data-center-in-middenmeer-netherlands/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "azure-netherlands-middenmeer",
    supplierSlug: "tennet",
    category: "electrical",
    role: "Dutch TSO 380kV grid connection",
    isLocal: true,
    sources: [{ url: "https://www.tennet.eu/", type: "operator" }],
  },

  // ─── Azure Sweden ───
  {
    datacenterSlug: "azure-sweden-central-gavle",
    supplierSlug: "skanska",
    category: "gc",
    role: "Construction partner Sweden Central region",
    isLocal: true,
    sources: [
      {
        url: "https://news.microsoft.com/sv-se/2020/06/16/microsoft-bygger-i-gavle-och-sandviken/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "azure-sweden-central-gavle",
    supplierSlug: "vattenfall",
    category: "electrical",
    role: "PPA + 24/7 renewable matching",
    isLocal: true,
    sources: [
      {
        url: "https://group.vattenfall.com/press-and-media/newsroom/2020/microsoft-and-vattenfall-launch-pioneering-247-matching-of-renewable-energy",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "azure-sweden-sandviken",
    supplierSlug: "skanska",
    category: "gc",
    role: "Construction Sandviken site",
    isLocal: true,
    sources: [
      {
        url: "https://news.microsoft.com/sv-se/2020/06/16/microsoft-bygger-i-gavle-och-sandviken/",
        type: "pr",
      },
    ],
  },

  // ─── Azure UK ───
  {
    datacenterSlug: "azure-uk-south-london",
    supplierSlug: "mace-group",
    category: "gc",
    role: "UK construction manager",
    isLocal: true,
    sources: [{ url: "https://www.macegroup.com/projects", type: "operator" }],
  },
  {
    datacenterSlug: "azure-uk-south-london",
    supplierSlug: "isg",
    category: "gc",
    role: "Fit-out contractor (collapsed 2024)",
    isLocal: true,
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/isg-collapses-data-center-projects-affected/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "azure-uk-west-cardiff",
    supplierSlug: "mercury-engineering",
    category: "electrical",
    role: "M&E contractor on UK West",
    sources: [
      {
        url: "https://www.mercuryeng.com/sectors/data-centres/",
        type: "operator",
      },
    ],
  },

  // ─── AWS Northern Virginia ───
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    supplierSlug: "holder-construction",
    category: "gc",
    role: "GC on multiple AWS NoVa buildings",
    sources: [
      {
        url: "https://www.holderconstruction.com/markets/mission-critical/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    supplierSlug: "clune-construction",
    category: "gc",
    role: "GC on Loudoun builds",
    sources: [{ url: "https://www.clunegc.com/projects/", type: "operator" }],
  },
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    supplierSlug: "dominion-energy",
    category: "electrical",
    role: "Primary electric utility",
    isLocal: true,
    sources: [
      {
        url: "https://www.dominionenergy.com/projects-and-facilities/electric-projects/data-centers",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    supplierSlug: "novec",
    category: "electrical",
    role: "Co-op utility serving parts of campus",
    isLocal: true,
    sources: [{ url: "https://www.novec.com/", type: "operator" }],
  },
  {
    datacenterSlug: "aws-northern-virginia-pjm",
    supplierSlug: "vertiv",
    category: "cooling",
    role: "Power and thermal infrastructure",
    sources: [
      {
        url: "https://investors.vertiv.com/news-releases/news-release-details/vertiv-strengthens-relationship-aws",
        type: "pr",
      },
    ],
  },

  // ─── AWS US-East-1 Ashburn ───
  {
    datacenterSlug: "aws-us-east-1-ashburn-main",
    supplierSlug: "holder-construction",
    category: "gc",
    role: "Long-running GC partner",
    sources: [
      {
        url: "https://www.holderconstruction.com/markets/mission-critical/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-us-east-1-ashburn-main",
    supplierSlug: "lumen-technologies",
    category: "fiber",
    role: "Long-haul + dark fiber",
    sources: [
      {
        url: "https://www.lumen.com/en-us/solutions/cloud-connect.html",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-us-east-1-ashburn-main",
    supplierSlug: "zayo-group",
    category: "fiber",
    role: "Metro and long-haul fiber",
    sources: [
      {
        url: "https://www.zayo.com/solutions/industries/cloud-providers/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-us-east-1-ashburn-main",
    supplierSlug: "cummins",
    category: "backup-power",
    role: "Diesel gensets",
    sources: [
      {
        url: "https://www.cummins.com/news/2023/03/22/cummins-data-center-power-generation",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-us-east-1-ashburn-main",
    supplierSlug: "caterpillar",
    category: "backup-power",
    role: "Backup power generators",
    sources: [
      {
        url: "https://www.cat.com/en_US/by-industry/electric-power/applications/data-center.html",
        type: "operator",
      },
    ],
  },

  // ─── AWS Boardman ───
  {
    datacenterSlug: "aws-us-west-2-boardman",
    supplierSlug: "fortis-construction",
    category: "gc",
    role: "Oregon-based GC",
    isLocal: true,
    sources: [
      {
        url: "https://www.fortisconstruction.com/markets/data-centers/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-us-west-2-boardman",
    supplierSlug: "umatilla-electric-cooperative",
    category: "electrical",
    role: "Local cooperative utility",
    isLocal: true,
    sources: [{ url: "https://www.umatillaelectric.com/", type: "operator" }],
  },

  // ─── AWS Central Ohio ───
  {
    datacenterSlug: "aws-us-east-2-new-albany",
    supplierSlug: "turner-construction",
    category: "gc",
    role: "GC on Central Ohio buildings",
    sources: [
      {
        url: "https://www.turnerconstruction.com/experience/markets/data-centers",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-us-east-2-new-albany",
    supplierSlug: "aep-ohio",
    category: "electrical",
    role: "Electric utility for Central Ohio campuses",
    isLocal: true,
    sources: [{ url: "https://www.aepohio.com/", type: "operator" }],
  },

  // ─── AWS Montreal ───
  {
    datacenterSlug: "aws-ca-central-1-montreal",
    supplierSlug: "hydro-quebec",
    category: "electrical",
    role: "Hydroelectric utility",
    isLocal: true,
    sources: [
      {
        url: "https://www.hydroquebec.com/business/customer-space/your-industry/data-centers.html",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "aws-ca-central-1-montreal",
    supplierSlug: "pomerleau",
    category: "gc",
    role: "Quebec GC",
    isLocal: true,
    sources: [
      {
        url: "https://pomerleau.ca/en/expertise/data-centres",
        type: "operator",
      },
    ],
  },

  // ─── AWS Querétaro ───
  {
    datacenterSlug: "aws-mexico-central-queretaro",
    supplierSlug: "cfe",
    category: "electrical",
    role: "Mexican federal utility",
    isLocal: true,
    sources: [{ url: "https://www.cfe.mx/", type: "operator" }],
  },

  // ─── Google sites ───
  {
    datacenterSlug: "google-the-dalles",
    supplierSlug: "hoffman-construction",
    category: "gc",
    role: "Oregon GC",
    isLocal: true,
    sources: [
      {
        url: "https://www.hoffmancorp.com/projects/google-the-dalles-data-center",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "google-the-dalles",
    supplierSlug: "northern-wasco-county-pud",
    category: "electrical",
    role: "Hydroelectric public utility",
    isLocal: true,
    sources: [{ url: "https://www.nwasco.com/", type: "operator" }],
  },
  {
    datacenterSlug: "google-eemshaven",
    supplierSlug: "bam-bouw-en-techniek",
    category: "gc",
    role: "Dutch GC",
    isLocal: true,
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/google-expand-eemshaven-data-center-netherlands/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "google-eemshaven",
    supplierSlug: "eneco",
    category: "electrical",
    role: "Wind power PPA partner",
    isLocal: true,
    sources: [
      {
        url: "https://news.eneco.com/eneco-and-google-extend-collaboration-on-renewable-energy/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "google-hamina",
    supplierSlug: "yit",
    category: "gc",
    role: "Finnish GC",
    isLocal: true,
    sources: [
      {
        url: "https://blog.google/around-the-globe/google-europe/finland-data-center-investment/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "google-hamina",
    supplierSlug: "fortum",
    category: "other",
    role: "Renewable + district heat offtake",
    isLocal: true,
    sources: [
      {
        url: "https://www.fortum.com/media/2018/05/fortum-google-hamina-waste-heat",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "google-saint-ghislain",
    supplierSlug: "besix",
    category: "gc",
    role: "Belgian GC",
    isLocal: true,
    sources: [{ url: "https://www.besix.com/en/projects", type: "operator" }],
  },
  {
    datacenterSlug: "google-saint-ghislain",
    supplierSlug: "engie-electrabel",
    category: "electrical",
    role: "Belgian utility / renewable PPA",
    isLocal: true,
    sources: [
      {
        url: "https://blog.google/around-the-globe/google-europe/belgium-data-center-100-renewable/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "google-fredericia",
    supplierSlug: "per-aarsleff",
    category: "civil",
    role: "Danish civil contractor",
    isLocal: true,
    sources: [{ url: "https://www.aarsleff.com/projects/", type: "operator" }],
  },
  {
    datacenterSlug: "google-fredericia",
    supplierSlug: "energinet",
    category: "electrical",
    role: "Danish TSO grid connection",
    isLocal: true,
    sources: [{ url: "https://en.energinet.dk/", type: "operator" }],
  },
  {
    datacenterSlug: "google-skien",
    supplierSlug: "skanska",
    category: "gc",
    role: "Construction partner",
    isLocal: true,
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/google-confirms-skien-norway-data-center/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "google-skien",
    supplierSlug: "statnett",
    category: "electrical",
    role: "Norwegian TSO transmission",
    isLocal: true,
    sources: [{ url: "https://www.statnett.no/en/", type: "operator" }],
  },
  {
    datacenterSlug: "google-london-europe-west2",
    supplierSlug: "mace-group",
    category: "gc",
    role: "UK construction partner",
    isLocal: true,
    sources: [{ url: "https://www.macegroup.com/projects", type: "operator" }],
  },
  {
    datacenterSlug: "google-london-europe-west2",
    supplierSlug: "mercury-engineering",
    category: "electrical",
    role: "M&E contractor on Google UK",
    sources: [
      {
        url: "https://www.mercuryeng.com/sectors/data-centres/",
        type: "operator",
      },
    ],
  },

  // ─── Meta sites ───
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "mortenson",
    category: "gc",
    role: "GC for Hyperion ~2GW campus",
    sources: [
      { url: "https://www.mortenson.com/data-center", type: "operator" },
      {
        url: "https://about.fb.com/news/2024/12/new-meta-data-center-richland-parish-louisiana/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "entergy-louisiana",
    category: "electrical",
    role: "Utility — building 3 new gas plants for ~2.3GW supply",
    isLocal: true,
    sources: [
      {
        url: "https://www.reuters.com/business/energy/entergy-build-three-natural-gas-plants-power-meta-data-center-2024-12-04/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "dpr-construction",
    category: "gc",
    role: "Construction partner",
    sources: [
      {
        url: "https://www.dpr.com/work/markets/advanced-technology/data-centers",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "whiting-turner",
    category: "gc",
    role: "GC for Hyperion buildings",
    sources: [{ url: "https://www.whiting-turner.com/", type: "operator" }],
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GPU systems for Meta AI training",
    sources: [
      {
        url: "https://about.fb.com/news/2024/12/introducing-our-newest-data-center-in-louisiana/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "schneider-electric",
    category: "electrical",
    role: "Modular electrical skids",
    sources: [
      { url: "https://www.se.com/ww/en/about-us/newsroom/news/", type: "pr" },
    ],
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "vertiv",
    category: "cooling",
    role: "Liquid cooling for AI training pods",
    sources: [
      {
        url: "https://www.vertiv.com/en-us/about/news-and-insights/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "meta-hyperion-richland",
    supplierSlug: "siemens-energy",
    category: "transformer",
    role: "HV transformers and substation",
    sources: [
      {
        url: "https://www.siemens-energy.com/global/en/home/press-releases/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "meta-clonee",
    supplierSlug: "mercury-engineering",
    category: "electrical",
    role: "M&E contractor",
    isLocal: true,
    sources: [
      {
        url: "https://www.mercuryeng.com/projects/data-centres/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "meta-clonee",
    supplierSlug: "jones-engineering",
    category: "electrical",
    role: "Irish M&E contractor",
    isLocal: true,
    sources: [
      {
        url: "https://www.jonesengineering.com/sectors/data-centres/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "meta-lulea",
    supplierSlug: "skanska",
    category: "gc",
    role: "Construction Luleå Node Pole",
    isLocal: true,
    sources: [
      {
        url: "https://www.skanska.com/about-skanska/media/press-releases/202466/Skanska-builds-extension-of-Facebook-data-center-in-Lulea-Sweden",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "meta-lulea",
    supplierSlug: "vattenfall",
    category: "electrical",
    role: "Hydroelectric utility",
    isLocal: true,
    sources: [
      {
        url: "https://group.vattenfall.com/press-and-media/newsroom/",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "meta-odense",
    supplierSlug: "per-aarsleff",
    category: "civil",
    role: "Danish civil contractor",
    isLocal: true,
    sources: [{ url: "https://www.aarsleff.com/projects/", type: "operator" }],
  },
  {
    datacenterSlug: "meta-odense",
    supplierSlug: "fjernvarme-fyn",
    category: "other",
    role: "District heating waste heat recovery",
    isLocal: true,
    sources: [
      {
        url: "https://about.fb.com/news/2020/06/odense-data-center-district-heating/",
        type: "pr",
      },
    ],
  },

  // ─── Stargate Abilene ───
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GB200 NVL72 GPU systems",
    sources: [
      {
        url: "https://nvidianews.nvidia.com/news/openai-nvidia-strategic-partnership-deploy-10-gigawatts",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "dpr-construction",
    category: "gc",
    role: "GC for data center buildings",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/crusoe-launches-construction-on-1gw-abilene-texas-campus-with-lancium/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "kiewit",
    category: "civil",
    role: "Civil works / EPC partner",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/crusoe-launches-construction-on-1gw-abilene-texas-campus-with-lancium/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "lancium",
    category: "electrical",
    role: "Clean Campus power infra / grid interconnection",
    sources: [
      {
        url: "https://lancium.com/lancium-and-crusoe-partner-to-deliver-clean-computing-infrastructure/",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "ge-vernova",
    category: "transformer",
    role: "Gas turbines + grid power equipment",
    sources: [
      { url: "https://www.gevernova.com/news/press-releases/", type: "pr" },
    ],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "solaris-energy-infrastructure",
    category: "backup-power",
    role: "On-site mobile gas turbines",
    sources: [{ url: "https://www.solarisenergy.com/", type: "pr" }],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "vertiv",
    category: "cooling",
    role: "Liquid cooling for GB200 deployments",
    sources: [
      { url: "https://investors.vertiv.com/news-releases/", type: "filing" },
    ],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "oncor",
    category: "electrical",
    role: "Utility transmission interconnect",
    isLocal: true,
    sources: [{ url: "https://www.oncor.com/", type: "operator" }],
  },
  {
    datacenterSlug: "stargate-abilene",
    supplierSlug: "lumen-technologies",
    category: "fiber",
    role: "Dedicated fiber routes for AI workloads",
    sources: [{ url: "https://news.lumen.com/", type: "pr" }],
  },
  {
    datacenterSlug: "oracle-stargate-abilene-2",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GB200/GB300 GPU systems for Phase 2",
    sources: [
      {
        url: "https://nvidianews.nvidia.com/news/openai-nvidia-strategic-partnership-deploy-10-gigawatts",
        type: "pr",
      },
    ],
  },

  // ─── xAI Colossus Memphis ───
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "100k H100 → expanding to 200k+ H200/GB200",
    sources: [
      {
        url: "https://nvidianews.nvidia.com/news/spectrum-x-xai-colossus",
        type: "pr",
      },
      { url: "https://x.ai/blog/colossus", type: "operator" },
    ],
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "supermicro",
    category: "hardware",
    role: "Liquid-cooled GPU server systems",
    sources: [{ url: "https://www.supermicro.com/", type: "pr" }],
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "dell-technologies",
    category: "hardware",
    role: "Server systems for Colossus expansion",
    sources: [
      {
        url: "https://www.reuters.com/technology/dell-supply-servers-xai-2024-12-02/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "solaris-energy-infrastructure",
    category: "backup-power",
    role: "On-site mobile gas turbines (~150MW)",
    sources: [{ url: "https://www.datacenterdynamics.com/en/", type: "news" }],
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "voltagrid",
    category: "backup-power",
    role: "Mobile natural gas generators",
    sources: [
      {
        url: "https://www.bloomberg.com/news/articles/2024-09-10/musk-xai-supercomputer-memphis-pollution-concerns",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "tesla",
    category: "backup-power",
    role: "Megapack BESS for Colossus 2",
    sources: [{ url: "https://www.datacenterdynamics.com/en/", type: "news" }],
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "mlgw",
    category: "electrical",
    role: "Memphis local distribution utility",
    isLocal: true,
    sources: [
      {
        url: "https://www.commercialappeal.com/story/news/2024/08/27/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "xai-colossus-memphis",
    supplierSlug: "mortenson",
    category: "gc",
    role: "Construction services / data hall buildout",
    sources: [{ url: "https://www.datacenterdynamics.com/en/", type: "news" }],
  },

  // ─── Stargate UAE / Khazna ───
  {
    datacenterSlug: "g42-stargate-uae-abu-dhabi",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GPU supplier via G42 partnership",
    sources: [
      {
        url: "https://www.reuters.com/world/middle-east/openai-g42-build-stargate-uae-ai-data-center-2025-05-22/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "g42-stargate-uae-abu-dhabi",
    supplierSlug: "cisco",
    category: "hardware",
    role: "Networking + security infrastructure",
    sources: [{ url: "https://newsroom.cisco.com/", type: "pr" }],
  },
  {
    datacenterSlug: "g42-stargate-uae-abu-dhabi",
    supplierSlug: "khazna",
    category: "other",
    role: "Local data center operator/builder (G42 subsidiary)",
    isLocal: true,
    sources: [{ url: "https://www.khazna.ae/", type: "pr" }],
  },
  {
    datacenterSlug: "khazna-abu-dhabi-ad1",
    supplierSlug: "etisalat-eand",
    category: "fiber",
    role: "Fiber connectivity provider",
    isLocal: true,
    sources: [{ url: "https://www.eand.com/", type: "pr" }],
  },
  {
    datacenterSlug: "khazna-abu-dhabi-ad1",
    supplierSlug: "schneider-electric",
    category: "electrical",
    role: "Power infrastructure across Khazna sites",
    sources: [{ url: "https://www.se.com/", type: "pr" }],
  },

  // ─── HUMAIN Saudi ───
  {
    datacenterSlug: "humain-saudi-riyadh",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "Up to 18,000 GB300 Blackwell GPUs initial deployment",
    sources: [
      {
        url: "https://www.reuters.com/technology/nvidia-supply-saudi-humain-with-blackwell-chips-2025-05-13/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "humain-saudi-riyadh",
    supplierSlug: "amd",
    category: "hardware",
    role: "$10B Instinct GPU partnership",
    sources: [{ url: "https://www.amd.com/en/press-releases/", type: "pr" }],
  },
  {
    datacenterSlug: "humain-saudi-riyadh",
    supplierSlug: "qualcomm",
    category: "hardware",
    role: "AI inference chips partnership",
    sources: [{ url: "https://www.qualcomm.com/news/", type: "pr" }],
  },
  {
    datacenterSlug: "humain-saudi-riyadh",
    supplierSlug: "cisco",
    category: "hardware",
    role: "Networking + security partner",
    sources: [{ url: "https://newsroom.cisco.com/", type: "pr" }],
  },
  {
    datacenterSlug: "humain-saudi-riyadh",
    supplierSlug: "saudi-electricity-company",
    category: "electrical",
    role: "Utility power supply",
    isLocal: true,
    sources: [{ url: "https://www.se.com.sa/", type: "pr" }],
  },

  // ─── Reliance Jamnagar ───
  {
    datacenterSlug: "reliance-jio-jamnagar-ai",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "Blackwell GPU supplier",
    sources: [
      {
        url: "https://www.reuters.com/world/india/nvidia-reliance-ai-infrastructure-india-2024-09-05/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "reliance-jio-jamnagar-ai",
    supplierSlug: "reliance-industries",
    category: "other",
    role: "Site owner / power supply / developer",
    isLocal: true,
    sources: [{ url: "https://www.ril.com/", type: "pr" }],
  },
  {
    datacenterSlug: "reliance-jio-jamnagar-ai",
    supplierSlug: "foxconn",
    category: "hardware",
    role: "Server assembly / electronics manufacturing partner",
    sources: [{ url: "https://www.reuters.com/", type: "news" }],
  },

  // ─── Yotta Hyderabad ───
  {
    datacenterSlug: "yotta-shakti-hyderabad",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "H100 GPU cluster — Shakti Cloud platform",
    sources: [
      { url: "https://www.yotta.com/data-center/hyderabad/", type: "operator" },
    ],
  },
  {
    datacenterSlug: "yotta-shakti-hyderabad",
    supplierSlug: "hiranandani-group",
    category: "other",
    role: "Parent company / site developer",
    isLocal: true,
    sources: [{ url: "https://www.yotta.com/about/", type: "operator" }],
  },
  {
    datacenterSlug: "yotta-shakti-hyderabad",
    supplierSlug: "tsgenco",
    category: "electrical",
    role: "Telangana State power supply",
    isLocal: true,
    sources: [{ url: "https://tsgenco.telangana.gov.in/", type: "operator" }],
  },

  // ─── YTL Kulai ───
  {
    datacenterSlug: "ytl-yondr-johor-kulai",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GPU supplier for sovereign AI cloud",
    sources: [
      {
        url: "https://nvidianews.nvidia.com/news/nvidia-and-ytl-power-international-to-build-malaysias-largest-ai-supercomputer",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "ytl-yondr-johor-kulai",
    supplierSlug: "ytl-power-international",
    category: "electrical",
    role: "Site developer + on-site solar power",
    isLocal: true,
    sources: [{ url: "https://www.ytlpowerinternational.com/", type: "pr" }],
  },
  {
    datacenterSlug: "ytl-yondr-johor-kulai",
    supplierSlug: "yondr-group",
    category: "gc",
    role: "Hyperscale data center developer / EPC",
    sources: [{ url: "https://www.yondrgroup.com/", type: "pr" }],
  },
  {
    datacenterSlug: "ytl-yondr-johor-kulai",
    supplierSlug: "tnb",
    category: "electrical",
    role: "Malaysian utility grid power",
    isLocal: true,
    sources: [{ url: "https://www.tnb.com.my/", type: "pr" }],
  },

  // ─── Naver Sejong ───
  {
    datacenterSlug: "naver-sejong-gak",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "H100 GPU systems for HyperCLOVA X",
    sources: [
      {
        url: "https://www.navercorp.com/en/promotion/datacentersGakSejong",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "naver-sejong-gak",
    supplierSlug: "samsung-cnt",
    category: "gc",
    role: "GC / construction lead",
    isLocal: true,
    sources: [{ url: "https://www.samsungcnt.com/", type: "pr" }],
  },
  {
    datacenterSlug: "naver-sejong-gak",
    supplierSlug: "lg-cns",
    category: "other",
    role: "IT systems integration partner",
    isLocal: true,
    sources: [{ url: "https://www.lgcns.com/en/", type: "pr" }],
  },
  {
    datacenterSlug: "naver-sejong-gak",
    supplierSlug: "kepco-korea",
    category: "electrical",
    role: "Korean utility power supply",
    isLocal: true,
    sources: [
      { url: "https://www.kepco.co.kr/eng/main/main.do", type: "operator" },
    ],
  },
  {
    datacenterSlug: "naver-sejong-gak",
    supplierSlug: "munters",
    category: "cooling",
    role: "Evaporative cooling (NAVER NAMU air-cooling)",
    sources: [{ url: "https://www.munters.com/", type: "pr" }],
  },

  // ─── SoftBank Keihanna ───
  {
    datacenterSlug: "softbank-keihanna-ai",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "Blackwell GPUs for Japan's largest AI supercomputer",
    sources: [
      {
        url: "https://www.reuters.com/technology/softbank-buys-sharp-osaka-plant-150-billion-yen-ai-data-center-2024-08-19/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "softbank-keihanna-ai",
    supplierSlug: "sharp-corporation",
    category: "other",
    role: "Site seller (former Sakai LCD plant) / co-developer",
    isLocal: true,
    sources: [{ url: "https://corporate.jp.sharp/", type: "pr" }],
  },
  {
    datacenterSlug: "softbank-keihanna-ai",
    supplierSlug: "kepco-japan",
    category: "electrical",
    role: "Kansai Electric utility power",
    isLocal: true,
    sources: [{ url: "https://www.kepco.co.jp/english/", type: "pr" }],
  },
  {
    datacenterSlug: "softbank-keihanna-ai",
    supplierSlug: "sb-energy",
    category: "electrical",
    role: "Renewable energy supply (SoftBank subsidiary)",
    isLocal: true,
    sources: [{ url: "https://www.sbenergy.jp/", type: "pr" }],
  },

  // ─── CoreWeave ───
  {
    datacenterSlug: "coreweave-plano",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GPU supplier (H100/H200/GB200 NVL72)",
    sources: [
      {
        url: "https://www.coreweave.com/blog/coreweave-first-to-deploy-nvidia-gb200-nvl72",
        type: "operator",
      },
    ],
  },
  {
    datacenterSlug: "coreweave-plano",
    supplierSlug: "dell-technologies",
    category: "hardware",
    role: "PowerEdge XE9680/XE9712 GB200 server integrator",
    sources: [
      {
        url: "https://www.dell.com/en-us/dt/case-studies-customer-stories/coreweave.htm",
        type: "pr",
      },
    ],
  },
  {
    datacenterSlug: "coreweave-plano",
    supplierSlug: "chirisa-technology-parks",
    category: "gc",
    role: "Build-to-suit data center developer",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/coreweave-leases-data-center-from-chirisa-in-plano-texas/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "coreweave-las-vegas-lv1",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GPU supplier (H100 cluster)",
    sources: [
      { url: "https://www.coreweave.com/data-centers", type: "operator" },
    ],
  },
  {
    datacenterSlug: "coreweave-las-vegas-lv1",
    supplierSlug: "supermicro",
    category: "hardware",
    role: "HGX H100/H200 server platform",
    sources: [{ url: "https://www.supermicro.com/", type: "pr" }],
  },
  {
    datacenterSlug: "coreweave-las-vegas-lv1",
    supplierSlug: "coolit",
    category: "cooling",
    role: "Direct liquid-to-chip CDUs",
    sources: [{ url: "https://www.coolitsystems.com/", type: "pr" }],
  },
  {
    datacenterSlug: "coreweave-atlanta-at1",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GPU supplier",
    sources: [
      { url: "https://www.coreweave.com/data-centers", type: "operator" },
    ],
  },
  {
    datacenterSlug: "coreweave-atlanta-at1",
    supplierSlug: "supermicro",
    category: "hardware",
    role: "GPU server OEM",
    sources: [{ url: "https://www.supermicro.com/", type: "pr" }],
  },
  {
    datacenterSlug: "coreweave-chicago-ch1",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "GPU supplier (H100/H200)",
    sources: [
      { url: "https://www.coreweave.com/data-centers", type: "operator" },
    ],
  },
  {
    datacenterSlug: "coreweave-chicago-ch1",
    supplierSlug: "vertiv",
    category: "cooling",
    role: "Liebert CDU + high-density cooling",
    sources: [{ url: "https://www.vertiv.com/", type: "pr" }],
  },

  // ─── Crusoe Iceland ───
  {
    datacenterSlug: "crusoe-iceland",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "H100/H200 GPU supply for Iceland AI cloud",
    sources: [
      {
        url: "https://www.datacenterdynamics.com/en/news/crusoe-acquires-iceland-data-center-from-gompute/",
        type: "news",
      },
    ],
  },
  {
    datacenterSlug: "crusoe-iceland",
    supplierSlug: "landsvirkjun",
    category: "other",
    role: "Hydro/geothermal power supply",
    isLocal: true,
    sources: [{ url: "https://www.landsvirkjun.com/", type: "pr" }],
  },

  // ─── Nordic AI ───
  {
    datacenterSlug: "atnorth-ice02-keflavik",
    supplierSlug: "iav",
    category: "gc",
    role: "Civil + general contractor",
    isLocal: true,
    sources: [{ url: "https://www.iav.is/", type: "pr" }],
  },
  {
    datacenterSlug: "atnorth-ice02-keflavik",
    supplierSlug: "landsnet",
    category: "electrical",
    role: "TSO HV interconnect",
    isLocal: true,
    sources: [{ url: "https://www.landsnet.is/", type: "pr" }],
  },
  {
    datacenterSlug: "atnorth-ice03-akureyri",
    supplierSlug: "tg-verktakar",
    category: "civil",
    role: "Local civil works at Akureyri",
    isLocal: true,
    sources: [{ url: "https://www.tg.is/", type: "pr" }],
  },
  {
    datacenterSlug: "atnorth-ice03-akureyri",
    supplierSlug: "landsvirkjun",
    category: "other",
    role: "Geothermal/hydro power offtake",
    isLocal: true,
    sources: [{ url: "https://www.landsvirkjun.com/", type: "pr" }],
  },
  {
    datacenterSlug: "verne-global-keflavik",
    supplierSlug: "landsvirkjun",
    category: "other",
    role: "Hydro/geothermal PPA",
    isLocal: true,
    sources: [{ url: "https://verneglobal.com/", type: "pr" }],
  },
  {
    datacenterSlug: "verne-global-keflavik",
    supplierSlug: "farice",
    category: "fiber",
    role: "Subsea fiber connectivity (FARICE-1, IRIS)",
    isLocal: true,
    sources: [{ url: "https://www.farice.is/", type: "pr" }],
  },
  {
    datacenterSlug: "verne-global-keflavik",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "H100 deployment for AI tenants",
    sources: [{ url: "https://verneglobal.com/", type: "pr" }],
  },
  {
    datacenterSlug: "hydro66-boden",
    supplierSlug: "skellefteakraft",
    category: "other",
    role: "Hydropower utility supply (north Sweden)",
    isLocal: true,
    sources: [{ url: "https://www.hydro66.com/", type: "operator" }],
  },
  {
    datacenterSlug: "nebius-mantsala",
    supplierSlug: "nvidia",
    category: "hardware",
    role: "H100/H200 GPU cluster",
    sources: [{ url: "https://nebius.com/about", type: "pr" }],
  },
  {
    datacenterSlug: "nebius-mantsala",
    supplierSlug: "fortum",
    category: "other",
    role: "District heating offtake / power partner",
    isLocal: true,
    sources: [{ url: "https://www.fortum.com/", type: "pr" }],
  },
  {
    datacenterSlug: "nebius-mantsala",
    supplierSlug: "fingrid",
    category: "electrical",
    role: "Finnish TSO grid interconnect",
    isLocal: true,
    sources: [{ url: "https://www.fingrid.fi/", type: "pr" }],
  },
  {
    datacenterSlug: "green-mountain-dc1-stavanger",
    supplierSlug: "lyse-energi",
    category: "other",
    role: "Hydropower utility supply",
    isLocal: true,
    sources: [{ url: "https://greenmountain.no/", type: "operator" }],
  },
  {
    datacenterSlug: "green-mountain-dc1-stavanger",
    supplierSlug: "asetek",
    category: "cooling",
    role: "Direct-to-chip liquid cooling for HPC pods",
    sources: [{ url: "https://www.asetek.com/", type: "pr" }],
  },
  {
    datacenterSlug: "lefdal-mine-datacenter",
    supplierSlug: "rittal",
    category: "other",
    role: "Modular containerized data hall systems",
    sources: [{ url: "https://www.rittal.com/", type: "pr" }],
  },
  {
    datacenterSlug: "lefdal-mine-datacenter",
    supplierSlug: "sfe",
    category: "other",
    role: "Local hydropower utility",
    isLocal: true,
    sources: [{ url: "https://lefdalmine.com/", type: "operator" }],
  },

  // ─── Bridge Data Centres Johor ───
  {
    datacenterSlug: "bridge-data-centres-mr1-johor",
    supplierSlug: "tnb",
    category: "electrical",
    role: "Malaysian utility power supply",
    isLocal: true,
    sources: [{ url: "https://www.bridgedatacentres.com/", type: "pr" }],
  },
  {
    datacenterSlug: "bridge-data-centres-mr1-johor",
    supplierSlug: "gamuda",
    category: "gc",
    role: "Malaysian GC for hyperscale build",
    isLocal: true,
    sources: [{ url: "https://gamuda.com.my/", type: "pr" }],
  },
  {
    datacenterSlug: "bridge-data-centres-mr1-johor",
    supplierSlug: "vertiv",
    category: "cooling",
    role: "Liebert XDU CDUs for direct-to-chip cooling",
    sources: [{ url: "https://www.vertiv.com/", type: "pr" }],
  },
];

// ────────────────────────────────────────────────────────────────────
// Seed runner
// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Upserting ${SUPPLIER_BRANDS.length} supplier brands...`);
  for (const b of SUPPLIER_BRANDS) {
    await db
      .insert(brands)
      .values({
        slug: b.slug,
        canonicalName: b.canonicalName,
        website: b.website,
        verified: true,
      })
      .onConflictDoNothing();
  }

  const allBrands = await db.select().from(brands);
  const brandMap = new Map(allBrands.map((b) => [b.slug, b.id]));

  const allDcs = await db
    .select({ id: datacenters.id, slug: datacenters.slug })
    .from(datacenters);
  const dcMap = new Map(allDcs.map((d) => [d.slug, d.id]));

  let inserted = 0;
  let dupSkipped = 0;
  const missingDc = new Set<string>();
  const missingBrand = new Set<string>();

  console.log(`Inserting ${SUPPLIERS.length} supplier links...`);
  for (const s of SUPPLIERS) {
    const dcId = dcMap.get(s.datacenterSlug);
    if (!dcId) {
      missingDc.add(s.datacenterSlug);
      continue;
    }
    const supplierId = brandMap.get(s.supplierSlug);
    if (!supplierId) {
      missingBrand.add(s.supplierSlug);
      continue;
    }

    const existing = await db
      .select({ id: datacenterSuppliers.id })
      .from(datacenterSuppliers)
      .where(
        and(
          eq(datacenterSuppliers.datacenterId, dcId),
          eq(datacenterSuppliers.supplierId, supplierId),
          eq(datacenterSuppliers.category, s.category),
        ),
      )
      .limit(1);
    if (existing.length) {
      dupSkipped++;
      continue;
    }

    await db.insert(datacenterSuppliers).values({
      datacenterId: dcId,
      supplierId,
      category: s.category,
      role: s.role,
      contractValueUsd: s.contractValueUsd,
      isLocal: s.isLocal ?? false,
      sources: s.sources satisfies DatacenterSource[],
      verified: true,
    });
    inserted++;
  }

  console.log(`Inserted: ${inserted}, dup-skipped: ${dupSkipped}`);
  if (missingDc.size) {
    console.warn(`Missing datacenter slugs (skipped):`, [...missingDc].sort());
  }
  if (missingBrand.size) {
    console.warn(`Missing brand slugs (skipped):`, [...missingBrand].sort());
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
