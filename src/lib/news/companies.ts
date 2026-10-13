import {
  displayStartupLogoUrl,
  startupSourceFaviconUrl,
} from "@/lib/investigations/startups";
import {
  indexNewsStartups,
  matchIndexedNewsStartups,
  type IndexedNewsStartup,
} from "@/lib/news/startup-match";

/**
 * Companies a news row can be about. Logos are the company's own favicon
 * (`https://{domain}/favicon.ico`) or a logo URL already stored on a
 * directory startup. Nothing here is drawn, generated, or proxied.
 */
export type NewsMatchCompany = {
  id: string;
  name: string;
  logoUrl: string;
  /** Set when this mark is a directory startup profile. */
  profilePath?: string;
};

export type NewsDirectoryCompany = {
  slug: string;
  name: string;
  homepage: string;
  logoUrl: string | null;
};

type CuratedCompany = {
  id: string;
  name: string;
  domains: readonly string[];
  aliases: readonly string[];
};

const CURATED_COMPANIES: readonly CuratedCompany[] = [
  {
    id: "openai",
    name: "OpenAI",
    domains: ["openai.com"],
    aliases: ["OpenAI", "ChatGPT"],
  },
  {
    id: "google",
    name: "Google",
    domains: ["google.com", "deepmind.google", "deepmind.com", "blog.google"],
    aliases: ["Google", "DeepMind", "Gemini"],
  },
  {
    id: "meta",
    name: "Meta",
    domains: ["meta.com", "ai.meta.com"],
    aliases: ["Meta"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    domains: ["anthropic.com"],
    aliases: ["Anthropic", "Claude"],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    domains: ["microsoft.com"],
    aliases: ["Microsoft"],
  },
  {
    id: "nvidia",
    name: "Nvidia",
    domains: ["nvidia.com"],
    aliases: ["Nvidia"],
  },
  {
    id: "apple",
    name: "Apple",
    domains: ["apple.com"],
    aliases: ["Apple"],
  },
  {
    id: "amazon",
    name: "Amazon",
    domains: ["amazon.com"],
    aliases: ["Amazon", "AWS"],
  },
  {
    id: "mistral",
    name: "Mistral",
    domains: ["mistral.ai"],
    aliases: ["Mistral"],
  },
  {
    id: "xai",
    name: "xAI",
    domains: ["x.ai"],
    aliases: ["xAI", "Grok"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    domains: ["huggingface.co"],
    aliases: ["Hugging Face", "HuggingFace"],
  },
  {
    id: "cohere",
    name: "Cohere",
    domains: ["cohere.com"],
    aliases: ["Cohere"],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    domains: ["perplexity.ai"],
    aliases: ["Perplexity"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    domains: ["deepseek.com"],
    aliases: ["DeepSeek"],
  },
  {
    id: "databricks",
    name: "Databricks",
    domains: ["databricks.com"],
    aliases: ["Databricks"],
  },
  {
    id: "stability",
    name: "Stability AI",
    domains: ["stability.ai"],
    aliases: ["Stability AI"],
  },
  {
    id: "midjourney",
    name: "Midjourney",
    domains: ["midjourney.com"],
    aliases: ["Midjourney"],
  },
  {
    id: "character",
    name: "Character.AI",
    domains: ["character.ai"],
    aliases: ["Character.AI", "Character AI"],
  },
  {
    id: "groq",
    name: "Groq",
    domains: ["groq.com"],
    aliases: ["Groq"],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    domains: ["cerebras.ai"],
    aliases: ["Cerebras"],
  },
  {
    id: "amd",
    name: "AMD",
    domains: ["amd.com"],
    aliases: ["AMD"],
  },
  {
    id: "intel",
    name: "Intel",
    domains: ["intel.com"],
    aliases: ["Intel"],
  },
  {
    id: "ibm",
    name: "IBM",
    domains: ["ibm.com"],
    aliases: ["IBM"],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    domains: ["salesforce.com"],
    aliases: ["Salesforce"],
  },
  {
    id: "adobe",
    name: "Adobe",
    domains: ["adobe.com"],
    aliases: ["Adobe"],
  },
  {
    id: "samsung",
    name: "Samsung",
    domains: ["samsung.com"],
    aliases: ["Samsung"],
  },
  {
    id: "tesla",
    name: "Tesla",
    domains: ["tesla.com"],
    aliases: ["Tesla"],
  },
  {
    id: "bytedance",
    name: "ByteDance",
    domains: ["bytedance.com"],
    aliases: ["ByteDance"],
  },
  {
    id: "alibaba",
    name: "Alibaba",
    domains: ["alibaba.com"],
    aliases: ["Alibaba", "Qwen"],
  },
  {
    id: "baidu",
    name: "Baidu",
    domains: ["baidu.com"],
    aliases: ["Baidu"],
  },
  {
    id: "inflection",
    name: "Inflection",
    domains: ["inflection.ai"],
    aliases: ["Inflection"],
  },
  {
    id: "together",
    name: "Together AI",
    domains: ["together.ai"],
    aliases: ["Together AI"],
  },
  {
    id: "palantir",
    name: "Palantir",
    domains: ["palantir.com"],
    aliases: ["Palantir"],
  },
  {
    id: "anduril",
    name: "Anduril",
    domains: ["anduril.com"],
    aliases: ["Anduril"],
  },
  {
    id: "scale",
    name: "Scale AI",
    domains: ["scale.com"],
    aliases: ["Scale AI"],
  },
  {
    id: "cursor",
    name: "Cursor",
    domains: ["cursor.com"],
    aliases: ["Cursor"],
  },
  {
    id: "runway",
    name: "Runway",
    domains: ["runwayml.com"],
    aliases: ["Runway"],
  },
];

export function newsHostname(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

/** Favicon on the source's own host. Null when the URL has no real host. */
export function newsSourceLogoUrl(
  href: string | null | undefined,
): string | null {
  if (!href) return null;
  return startupSourceFaviconUrl(href);
}

function mentions(haystack: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (trimmed.length < 2) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(haystack);
}

function hostOverlaps(host: string, domain: string): boolean {
  const dom = domain.toLowerCase().replace(/^www\./, "");
  return host === dom || host.endsWith(`.${dom}`) || dom.endsWith(`.${host}`);
}

function curatedLogo(company: CuratedCompany): string | null {
  return startupSourceFaviconUrl(`https://${company.domains[0]}/`);
}

/**
 * Companies named in the title or text, or whose own domain is the article
 * host. Directory startups are included only by the precise startup matcher
 * (domain, or an exact non-generic name). Curated companies win on a shared
 * domain so a startup row does not add a second logo for the same host.
 */
/** Directory startups the precise matcher may name. Curated companies stay out. */
export function indexNewsDirectory(
  directory: readonly NewsDirectoryCompany[],
): IndexedNewsStartup[] {
  const curatedNames = new Set(
    CURATED_COMPANIES.flatMap((company) => [
      company.name.toLowerCase(),
      ...company.aliases.map((alias) => alias.toLowerCase()),
    ]),
  );
  return indexNewsStartups(
    directory.flatMap((startup) => {
      const name = startup.name.trim();
      if (!name || curatedNames.has(name.toLowerCase())) return [];
      return [
        {
          id: startup.slug,
          slug: startup.slug,
          name,
          homepage: startup.homepage,
        },
      ];
    }),
  );
}

export function detectNewsCompanies(
  input: { title: string; text: string; url: string | null },
  directory: readonly NewsDirectoryCompany[] = [],
  indexed: readonly IndexedNewsStartup[] = indexNewsDirectory(directory),
): NewsMatchCompany[] {
  const haystack = `\n${input.title}\n${input.text}\n`;
  const host = newsHostname(input.url);
  const found: NewsMatchCompany[] = [];
  const seenIds = new Set<string>();
  const seenHosts = new Set<string>();

  const push = (company: NewsMatchCompany) => {
    if (seenIds.has(company.id)) return;
    const logoHost = newsHostname(company.logoUrl);
    if (logoHost && seenHosts.has(logoHost)) return;
    seenIds.add(company.id);
    if (logoHost) seenHosts.add(logoHost);
    found.push(company);
  };

  for (const company of CURATED_COMPANIES) {
    const named = company.aliases.some((alias) => mentions(haystack, alias));
    const hosted =
      host != null &&
      company.domains.some((domain) => hostOverlaps(host, domain));
    if (!named && !hosted) continue;
    const logoUrl = curatedLogo(company);
    if (!logoUrl) continue;
    push({ id: company.id, name: company.name, logoUrl });
  }

  const bySlug = new Map(directory.map((startup) => [startup.slug, startup]));
  const matched = matchIndexedNewsStartups(input, indexed);

  for (const hit of matched) {
    const startup = bySlug.get(hit.slug);
    if (!startup) continue;
    const home = newsHostname(startup.homepage);
    if (
      home &&
      CURATED_COMPANIES.some((company) =>
        company.domains.some((domain) => hostOverlaps(home, domain)),
      )
    ) {
      continue;
    }
    const logoUrl =
      displayStartupLogoUrl(startup.logoUrl) ??
      (startup.homepage ? startupSourceFaviconUrl(startup.homepage) : null);
    if (!logoUrl) continue;
    push({ id: `dir:${startup.slug}`, name: startup.name.trim(), logoUrl });
  }

  return found;
}
