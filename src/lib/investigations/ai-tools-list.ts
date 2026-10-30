import { resolveLocale } from "@/i18n/messages";
import {
  isThinStartupProfile,
  startupProfileIndexInput,
} from "@/lib/investigations/startup-profile-index";
import { buildStartupProfilePath } from "@/lib/investigations/startups";
import { absoluteLocaleUrl } from "@/lib/metadata";

/**
 * Localized hub for the AI tools directory.
 *
 * The page is its own directory. It does not render the startup row that
 * shares this slug, and it does not invent a tool count.
 */
export const AI_TOOLS_LIST_PATH = "/startups/ai-tools-list";

/**
 * Category values that this hub treats as its set. This is a mapping of the
 * existing build taxonomy, not a field that says "AI tool".
 */
export const AI_TOOLS_LIST_CATEGORIES = ["agents", "models"] as const;

export type AiToolsListCategory = (typeof AI_TOOLS_LIST_CATEGORIES)[number];

export type AiToolsListTool = {
  name: string;
  url: string;
};

/** Sourced tools only. Empty until a named tool with a real URL is added. */
export const AI_TOOLS_LIST_TOOLS: readonly AiToolsListTool[] = [];

export const AI_TOOLS_LIST_COPY = {
  en: {
    title: "AI tools",
    description:
      "Approved startups whose recorded category is agents or models. Open a name to read that startup's own profile on this site.",
    intro:
      "These names are startups filed as agents or models. Follow one to open its profile.",
    heading: "AI tools",
    kicker: "Directory",
  },
  nl: {
    title: "AI-tools",
    description:
      "Goedgekeurde startups met de categorie agents of models. Open een naam om het profiel van die startup op deze site te lezen.",
    intro:
      "De namen hieronder zijn startups in de categorie agents of models. Volg een naam naar het profiel.",
    heading: "AI-tools",
    kicker: "Lijst",
  },
  fr: {
    title: "Outils IA",
    description:
      "Startups approuvées dont la catégorie enregistrée est agents ou models. Ouvrez un nom pour consulter le profil de cette startup sur ce site.",
    intro:
      "Ces startups sont classées dans les catégories agents ou models. Sélectionnez un nom pour ouvrir son profil.",
    heading: "Outils IA",
    kicker: "Annuaire",
  },
} as const;

export type AiToolsListLocale = keyof typeof AI_TOOLS_LIST_COPY;

export function aiToolsListCopy(locale: string) {
  return AI_TOOLS_LIST_COPY[resolveLocale(locale)];
}

export function isAiToolsListCategory(
  category: string,
): category is AiToolsListCategory {
  return (AI_TOOLS_LIST_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Approved agents/models rows that the thin-profile rule still indexes.
 * A short blurb with no open roles stays off this page, same as noindex.
 */
export function isAiToolsHubStartup(card: {
  slug: string;
  category: string;
  description: string | null | undefined;
  openRoleCount: number;
}): boolean {
  if (!isAiToolsListCategory(card.category)) return false;
  return !isThinStartupProfile(
    startupProfileIndexInput({
      slug: card.slug,
      description: card.description,
      openRoleCount: card.openRoleCount,
    }),
  );
}

export function aiToolsHubLocale(locale: string) {
  return resolveLocale(locale);
}

/** Profile path with the locale prefix, for example `/en/startups/acme`. */
export function aiToolsHubProfileHref(locale: string, slug: string): string {
  return `/${aiToolsHubLocale(locale)}${buildStartupProfilePath(slug)}`;
}

export function aiToolsHubProfileUrl(locale: string, slug: string): string {
  return absoluteLocaleUrl(
    aiToolsHubLocale(locale),
    buildStartupProfilePath(slug),
  );
}

/** Path without a locale prefix. Page 1 omits the query. */
export function aiToolsHubPagePath(page: number): string {
  return page <= 1 ? AI_TOOLS_LIST_PATH : `${AI_TOOLS_LIST_PATH}?page=${page}`;
}

/** Locale-prefixed pager href, for example `/nl/startups/ai-tools-list?page=2`. */
export function aiToolsHubPageHref(locale: string, page: number): string {
  return `/${aiToolsHubLocale(locale)}${aiToolsHubPagePath(page)}`;
}

/** Tools that render on the page: a name and an http(s) URL, nothing else. */
export function aiToolsOnPage(
  tools: readonly AiToolsListTool[] = AI_TOOLS_LIST_TOOLS,
): AiToolsListTool[] {
  return listedTools(tools);
}

function listedTools(tools: readonly AiToolsListTool[]): AiToolsListTool[] {
  const listed: AiToolsListTool[] = [];
  for (const tool of tools) {
    const name = tool.name.trim();
    if (!name) continue;
    try {
      const url = new URL(tool.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      listed.push({ name, url: url.toString() });
    } catch {
      continue;
    }
  }
  return listed;
}

/** CollectionPage for this directory. ItemList is the listed tools, or none. */
export function aiToolsListJsonLd(
  locale: string,
  tools: readonly AiToolsListTool[] = AI_TOOLS_LIST_TOOLS,
  page = 1,
): Record<string, unknown> {
  const copy = aiToolsListCopy(locale);
  const resolved = resolveLocale(locale);
  const items = aiToolsOnPage(tools).map((tool, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: tool.name,
    url: tool.url,
  }));
  return {
    "@type": "CollectionPage",
    name: copy.heading,
    description: copy.description,
    url: absoluteLocaleUrl(resolved, aiToolsHubPagePath(page)),
    inLanguage: resolved,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items,
    },
  };
}
