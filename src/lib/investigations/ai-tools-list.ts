import { absoluteLocaleUrl } from "@/lib/metadata";

/**
 * English and Dutch hub for the AI tools directory.
 *
 * The page is its own directory. It does not render the startup row that
 * shares this slug, and it does not invent a tool count.
 */
export const AI_TOOLS_LIST_PATH = "/startups/ai-tools-list";

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
      "AI tools are software for a task, such as writing, research, coding, or images. Open a tool by following the link on its listing.",
    intro:
      "Choose an AI tool from this directory and follow its link to the page where the software opens.",
    heading: "AI tools",
    kicker: "Directory",
  },
  nl: {
    title: "AI-tools",
    description:
      "AI-tools zijn software voor een taak, zoals schrijven, onderzoek, code of beelden. Open een tool door de link bij de vermelding te volgen.",
    intro:
      "Kies een AI-tool in deze directory en volg de link naar de pagina waar de software opent.",
    heading: "AI-tools",
    kicker: "Lijst",
  },
} as const;

export type AiToolsListLocale = keyof typeof AI_TOOLS_LIST_COPY;

export function aiToolsListCopy(locale: string) {
  return locale === "nl" ? AI_TOOLS_LIST_COPY.nl : AI_TOOLS_LIST_COPY.en;
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
): Record<string, unknown> {
  const copy = aiToolsListCopy(locale);
  const resolved = locale === "nl" ? "nl" : "en";
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
    url: absoluteLocaleUrl(resolved, AI_TOOLS_LIST_PATH),
    inLanguage: resolved,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items,
    },
  };
}
