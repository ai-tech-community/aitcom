/**
 * AI flag for one collected news story, read from its title and source excerpt.
 *
 * True means that text says the story is about AI. False means it describes
 * technology or business and does not say that. Null means the text does
 * not settle it. An unclear headline stays null rather than being stored
 * as not-AI.
 *
 * A false or null flag never drops the story. The row still needs the
 * feed's own URL, and this function does not invent one. Generated
 * summaries are not read: an older TL;DR was asked to treat every item as
 * AI news, so it cannot decide the flag.
 */

const URL_OR_EMAIL =
  /\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi;

/** Hosts such as example.ai must not count as the word "ai". */
const DOMAIN = /\b[\w-]+(?:\.[\w-]+)+\b/g;

const AI_NEWS_PATTERNS: readonly RegExp[] = [
  /\bai\b/i,
  /\bartificial intelligence\b/i,
  /\bkunstmatige intelligentie\b/i,
  /\bmachine[\s-]?learning\b/i,
  /\bmachinaal leren\b/i,
  /\bdeep learning\b/i,
  /\bneural networks?\b/i,
  /\bneurale netwerken\b/i,
  /\blarge language models?\b/i,
  /\bfoundation models?\b/i,
  /\bgenerative ai\b/i,
  /\bgenai\b/i,
  /\bcomputer vision\b/i,
  /\bnatural language processing\b/i,
  /\bllms?\b/i,
  /\bnlp\b/i,
  /\bchatgpt\b/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bdeepmind\b/i,
  /\bmidjourney\b/i,
  /\bgpt-\d+\b/i,
  /\bgpt\b/i,
  /\bstable diffusion\b/i,
];

/**
 * A technology or business subject that is not an AI signal. With no AI
 * signal, this is a confident not-AI reading. Without one of these, a
 * headline that never says what it is about stays null.
 */
const OTHER_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\bearnings\b/i,
  /\brevenues?\b/i,
  /\bprofits?\b/i,
  /\bquarterly\b/i,
  /\bipos?\b/i,
  /\bacquisitions?\b/i,
  /\bmergers?\b/i,
  /\blayoffs?\b/i,
  /\bdividends?\b/i,
  /\bstocks?\b/i,
  /\bshares\b/i,
  /\bmortgages?\b/i,
  /\binterest rates?\b/i,
  /\binflation\b/i,
  /\bfederal reserve\b/i,
  /\bcentral banks?\b/i,
  /\bgdp\b/i,
  /\bunemployment\b/i,
  /\btax(?:es|ation)?\b/i,
  /\bbudgets?\b/i,
  /\bbanks?\b/i,
  /\bbanking\b/i,
  /\bwall street\b/i,
  /\bshareholders?\b/i,
  /\bsmartphones?\b/i,
  /\biphones?\b/i,
  /\bandroid\b/i,
  /\blaptops?\b/i,
  /\bcybersecurity\b/i,
  /\bransomware\b/i,
  /\bspyware\b/i,
  /\bdata breaches?\b/i,
  /\bbroadband\b/i,
  /\bvideo games?\b/i,
  /\bplaystation\b/i,
  /\bxbox\b/i,
  /\bnintendo\b/i,
  /\belectric vehicles?\b/i,
  /\bsolar\b/i,
  /\bnuclear\b/i,
  /\bbatter(?:y|ies)\b/i,
  /\bwi-?fi\b/i,
  /\bomzet\b/i,
  /\bwinst\b/i,
  /\bbeurs\b/i,
  /\brente\b/i,
  /\binflatie\b/i,
  /\bovernames?\b/i,
  /\bontslagen?\b/i,
];

export function newsTextForAi(title: string, summary?: string | null): string {
  return `${title}\n${summary ?? ""}`
    .replace(URL_OR_EMAIL, " ")
    .replace(/\ba\s*\.\s*i\b\.?/gi, " ai ")
    .replace(DOMAIN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the stored text has an AI signal. False when it describes
 * technology or business without one. Null when the title and excerpt do
 * not settle it.
 */
export function classifyNewsAi(
  title: string,
  summary?: string | null,
): boolean | null {
  const text = newsTextForAi(title, summary);
  if (!text) return null;
  if (AI_NEWS_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (OTHER_SUBJECT_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  return null;
}

export type ClassifiableNewsItem = {
  id: string;
  title: string;
  summary: string | null;
};

/**
 * Split a batch. Ambiguous rows are listed separately and stay null so a
 * later reading can still classify them.
 */
export function groupNewsAiUpdates(rows: readonly ClassifiableNewsItem[]): {
  ai: string[];
  notAi: string[];
  ambiguous: string[];
} {
  const ai: string[] = [];
  const notAi: string[] = [];
  const ambiguous: string[] = [];
  for (const row of rows) {
    const reading = classifyNewsAi(row.title, row.summary);
    if (reading === true) ai.push(row.id);
    else if (reading === false) notAi.push(row.id);
    else ambiguous.push(row.id);
  }
  return { ai, notAi, ambiguous };
}
