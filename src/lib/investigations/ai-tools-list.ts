/**
 * English (and Dutch) hub for the AI tools directory.
 *
 * `/nl/startups/ai-tools-list` is the listed company AIAI.Tools. This module
 * is the publish-ready title and description for both locales. Copy is a
 * full sentence under 160 characters. It does not repeat listing notes.
 */
export const AI_TOOLS_LIST_PATH = "/startups/ai-tools-list";

export const AI_TOOLS_LIST_SLUG = "ai-tools-list";

/** Live directory the company publishes. Fetched 26 Oct 2026. */
export const AI_TOOLS_LIST_SITE = "https://aiai.tools";

export const AI_TOOLS_LIST_COPY = {
  en: {
    title: "AI tools",
    description: "AIAI.Tools is a public directory of AI tools.",
    heading: "AI tools",
    body: "AIAI.Tools publishes a public directory of AI tools.",
  },
  nl: {
    title: "AI-tools",
    description: "AIAI.Tools is een openbare lijst met AI-tools.",
    heading: "AI-tools",
    body: "AIAI.Tools publiceert een openbare lijst met AI-tools.",
  },
} as const;

export type AiToolsListLocale = keyof typeof AI_TOOLS_LIST_COPY;

export function aiToolsListCopy(locale: string) {
  return locale === "nl" ? AI_TOOLS_LIST_COPY.nl : AI_TOOLS_LIST_COPY.en;
}
