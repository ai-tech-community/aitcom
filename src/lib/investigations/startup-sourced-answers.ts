/**
 * Short public answers for four startup profiles.
 *
 * Every sentence is taken from a page fetched on 26 Oct 2026 (company site,
 * Y Combinator, or press). Facts with no source URL are omitted. No funding
 * amount is stated unless that page printed one — none of these pages did.
 */
export type SourcedFactId = "does" | "founders" | "funding";

export type SourcedStatement = {
  id: SourcedFactId;
  text: string;
  sourceUrl: string;
  sourceLabel: string;
};

export type StartupSourcedAnswer = {
  slug: string;
  statements: readonly SourcedStatement[];
};

export const STARTUP_SOURCED_ANSWERS: readonly StartupSourcedAnswer[] = [
  {
    slug: "elip-ai",
    statements: [
      {
        id: "does",
        text: "Elip listens first, then finds the right people the right work. After a short conversation it reads new job postings and names people when a company needs someone like them.",
        sourceUrl: "https://tryelip.ai/",
        sourceLabel: "Elip",
      },
      {
        id: "founders",
        text: "Gaurav Luhariwala is the founder and CEO of Elip AI.",
        sourceUrl: "https://www.ycombinator.com/companies/elip-ai",
        sourceLabel: "Y Combinator",
      },
      {
        id: "funding",
        text: "Y Combinator lists Elip AI in its Winter 2025 batch.",
        sourceUrl: "https://www.ycombinator.com/companies/elip-ai",
        sourceLabel: "Y Combinator",
      },
    ],
  },
  {
    slug: "dtscout",
    statements: [
      {
        id: "does",
        text: "DTSCOUT provides a single point of contact to millions of publishers, with audience segments in behavioural, demographic, and contextual verticals.",
        sourceUrl: "https://www.dtscout.com",
        sourceLabel: "DTSCOUT",
      },
    ],
  },
  {
    slug: "kueez",
    statements: [
      {
        id: "does",
        text: "Kueez helps publishers grow audiences and monetize content through audience acquisition, commerce, and KueezRTB.",
        sourceUrl: "https://weare.kueez.com/",
        sourceLabel: "Kueez",
      },
      {
        id: "founders",
        text: "Ori Mendi is co-founder and CEO, Shahaf Kimhi is co-founder and COO, and Daniel Tony is co-founder and chief architect.",
        sourceUrl: "https://weare.kueez.com/about",
        sourceLabel: "Kueez",
      },
    ],
  },
  {
    slug: "salesplay-x",
    statements: [
      {
        id: "does",
        text: "SalesPlay X is a strategic messaging platform that helps teams research accounts and create proposals and personalized sales documents.",
        sourceUrl: "https://www.salesplayx.com/",
        sourceLabel: "SalesPlay X",
      },
      {
        id: "founders",
        text: "Meg Hall and Sweta Mulji are the founders of SalesPlay X.",
        sourceUrl:
          "https://www.prweb.com/releases/techstars-sf-graduates-ambitious-ai-startups-with-record-setting-revenues-302468642.html",
        sourceLabel: "PRWeb",
      },
      {
        id: "funding",
        text: "SalesPlay X lists Jason Kurtz, BlueStartups, and Hatcher+ as current investors. BlueStartups provided capital, and Hatcher+ has invested.",
        sourceUrl: "https://www.salesplayx.com/about/investors",
        sourceLabel: "SalesPlay X",
      },
    ],
  },
];

const ANSWERS_BY_SLUG = new Map(
  STARTUP_SOURCED_ANSWERS.map((answer) => [answer.slug, answer]),
);

export function startupSourcedAnswer(
  slug: string,
): StartupSourcedAnswer | null {
  return ANSWERS_BY_SLUG.get(slug) ?? null;
}

/** The sourced "what it does" sentence, when one was recorded. Nothing else. */
export function sourcedAnswerBlurb(slug: string): string | null {
  const text =
    startupSourcedAnswer(slug)
      ?.statements.find((statement) => statement.id === "does")
      ?.text.trim() ?? "";
  return text.length > 0 ? text : null;
}
