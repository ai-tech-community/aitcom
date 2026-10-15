/**
 * AI flag for one sourced job, read from the posting itself.
 *
 * This is not the company `uses_ai` flag. True means the title or description says the
 * work is AI. False means that text was read and it does not. Null is only
 * for a row the scanner and the backfill have not classified yet.
 *
 * A false flag never drops the role. The posting still needs a real title
 * and a real source URL; this function does not invent either.
 */

const URL_OR_EMAIL =
  /\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi;

/** Hosts such as example.ai must not count as the word "ai". */
const DOMAIN = /\b[\w-]+(?:\.[\w-]+)+\b/g;

const AI_JOB_PATTERNS: readonly RegExp[] = [
  /\bai\b/i,
  /\bartificial intelligence\b/i,
  /\bkunstmatige intelligentie\b/i,
  /\bmachine[\s-]?learning\b/i,
  /\bmachinaal leren\b/i,
  /\bdeep learning\b/i,
  /\breinforcement learning\b/i,
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
  /\bmlops\b/i,
  /\bml\b/i,
  /\bprompt engineers?\b/i,
  /\bfine-?tun(?:e|ing|ed)\b/i,
  /\bpytorch\b/i,
  /\btensorflow\b/i,
  /\bhugging[\s-]?face\b/i,
  /\bchatgpt\b/i,
  /\bopenai\b/i,
  /\bgpt-\d+\b/i,
  /\bgpt\b/i,
  /\bretrieval[- ]augmented\b/i,
  /\brag\b/i,
  /\bdiffusion models?\b/i,
  /\bembeddings?\b/i,
  /\bdata scientists?\b/i,
  /\bchatbots?\b/i,
  /\btransformer models?\b/i,
];

export function postingTextForAi(
  title: string,
  description: string | null | undefined,
): string {
  return `${title}\n${description ?? ""}`
    .replace(URL_OR_EMAIL, " ")
    .replace(/\ba\s*\.\s*i\b\.?/gi, " ai ")
    .replace(DOMAIN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the posting text says the work is AI. False when it does not. */
export function classifyJobAi(
  title: string,
  description: string | null | undefined,
): boolean {
  const text = postingTextForAi(title, description);
  if (!text) return false;
  return AI_JOB_PATTERNS.some((pattern) => pattern.test(text));
}

export type StartupRoleAiCounts = {
  ai: number;
  notAi: number;
  unclassified: number;
};

/**
 * Counts for a later AI vs non-AI comparison. Unclassified rows stay out of
 * both sides. This does not render a page.
 */
export type ClassifiableRole = {
  id: string;
  title: string;
  descriptionText: string | null;
};

/** Split a batch into AI and non-AI ids. Every input row is classified. */
export function groupRoleAiUpdates(rows: readonly ClassifiableRole[]): {
  ai: string[];
  notAi: string[];
} {
  const ai: string[] = [];
  const notAi: string[] = [];
  for (const row of rows) {
    if (classifyJobAi(row.title, row.descriptionText)) ai.push(row.id);
    else notAi.push(row.id);
  }
  return { ai, notAi };
}

export function countStartupRolesByAi(
  roles: readonly { isAi?: boolean | null }[],
): StartupRoleAiCounts {
  let ai = 0;
  let notAi = 0;
  let unclassified = 0;
  for (const role of roles) {
    if (role.isAi === true) ai += 1;
    else if (role.isAi === false) notAi += 1;
    else unclassified += 1;
  }
  return { ai, notAi, unclassified };
}
