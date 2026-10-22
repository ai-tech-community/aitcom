/**
 * Page-specific SEO copy. The shared event meta builder stays generic;
 * these overrides apply only to the slugs named here.
 *
 * AI Engineer New York's official page (https://ai.engineer/nyc/2026),
 * fetched 19 Oct 2026, describes 12–14 October 2026 and past NYC conferences.
 * It does not state a next New York edition or date. Europe, 17–19 February
 * 2027, is a different event, so this page does not mention it.
 */

export const NVIDIA_GTC_BERLIN_SLUG = "nvidia-gtc-berlin-2026";
export const AI_ENGINEER_NEW_YORK_SLUG = "ai-engineer-new-york-2026";

export const AI_ENGINEER_NEW_YORK_OFFICIAL_URL = "https://ai.engineer/nyc/2026";

export const NVIDIA_NL_ENGLISH_LINKS = [
  { href: "/en/join", label: "Word lid van AIT" },
  {
    href: "/en/guides/register-agent-mcp",
    label: "Registreer een agent",
  },
] as const;

const AI_ENGINEER_NEW_YORK_RECAP = {
  en: {
    title: "AI Engineer New York 2026 recap",
    description:
      "AI Engineer New York 2026 recap. 12–14 Oct 2026. New York. Future editions are on the official site.",
    body: "Recap of AI Engineer New York, held 12–14 October 2026 in New York. The official site does not list a next edition.",
  },
  nl: {
    title: "AI Engineer New York 2026 terugblik",
    description:
      "Terugblik op AI Engineer New York 2026. 12–14 okt 2026. New York. Toekomstige edities staan op de officiële site.",
    body: "Terugblik op AI Engineer New York, 12–14 oktober 2026 in New York. De officiële site noemt geen volgende editie.",
  },
} as const;

export function nvidiaNlEnglishLinks(
  slug: string,
  locale: string,
): typeof NVIDIA_NL_ENGLISH_LINKS | null {
  if (slug !== NVIDIA_GTC_BERLIN_SLUG || locale !== "nl") return null;
  return NVIDIA_NL_ENGLISH_LINKS;
}

export function aiEngineerNewYorkRecap(
  slug: string,
  locale: string,
):
  | (typeof AI_ENGINEER_NEW_YORK_RECAP)[keyof typeof AI_ENGINEER_NEW_YORK_RECAP]
  | null {
  if (slug !== AI_ENGINEER_NEW_YORK_SLUG) return null;
  return locale === "nl"
    ? AI_ENGINEER_NEW_YORK_RECAP.nl
    : AI_ENGINEER_NEW_YORK_RECAP.en;
}

/** Stored title, unless this slug has a recap title. */
export function eventSeoTitle(
  slug: string,
  locale: string,
  storedTitle: string,
): string {
  return aiEngineerNewYorkRecap(slug, locale)?.title ?? storedTitle;
}

/** Recap meta, or null so the caller keeps the shared builder output. */
export function eventSeoDescription(
  slug: string,
  locale: string,
): string | null {
  return aiEngineerNewYorkRecap(slug, locale)?.description ?? null;
}
