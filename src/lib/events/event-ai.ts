/**
 * AI flag for one event, read from the title, summary, and description
 * the event already stores.
 *
 * True means that text says the event is about AI. False means the text
 * was read and it does not. Null is only for a row the write path and the
 * backfill have not classified yet.
 *
 * A false flag never drops the event. Discovery still needs a real source
 * link, and this function does not invent one.
 */

const URL_OR_EMAIL =
  /\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi;

/** Hosts such as example.ai must not count as the word "ai". */
const DOMAIN = /\b[\w-]+(?:\.[\w-]+)+\b/g;

const AI_EVENT_PATTERNS: readonly RegExp[] = [
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

export type EventAiFilter = "yes" | "no";

export function eventTextForAi(
  title: string,
  description: string | null | undefined,
  summary?: string | null,
): string {
  return `${title}\n${summary ?? ""}\n${description ?? ""}`
    .replace(URL_OR_EMAIL, " ")
    .replace(/\ba\s*\.\s*i\b\.?/gi, " ai ")
    .replace(DOMAIN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the stored text says the event is about AI. False when it does not. */
export function classifyEventAi(
  title: string,
  description: string | null | undefined,
  summary?: string | null,
): boolean {
  const text = eventTextForAi(title, description, summary);
  if (!text) return false;
  return AI_EVENT_PATTERNS.some((pattern) => pattern.test(text));
}

export type ClassifiableEvent = {
  id: number;
  title: string;
  description: string | null;
  summary?: string | null;
};

/** Split a batch into AI and non-AI ids. Every input row is classified. */
export function groupEventAiUpdates(rows: readonly ClassifiableEvent[]): {
  ai: number[];
  notAi: number[];
} {
  const ai: number[] = [];
  const notAi: number[] = [];
  for (const row of rows) {
    if (classifyEventAi(row.title, row.description, row.summary))
      ai.push(row.id);
    else notAi.push(row.id);
  }
  return { ai, notAi };
}

/** `?ai=1` is AI. `?ai=0` is an explicit false, never a null row. */
export function parseEventAiQuery(
  value: string | undefined,
): EventAiFilter | null {
  if (value === "1") return "yes";
  if (value === "0") return "no";
  return null;
}

/**
 * Filtered AI views stay followable and point their canonical at the
 * unfiltered list. The unfiltered page stays indexable.
 */
export function eventAiRobots(filter: EventAiFilter | null): {
  index: boolean;
  follow: true;
} {
  if (filter === "yes" || filter === "no") {
    return { index: false, follow: true };
  }
  return { index: true, follow: true };
}

/** Event JSON-LD stays on the unfiltered listing only. */
export function eventListingEmitsJsonLd(filter: EventAiFilter | null): boolean {
  return filter === null;
}
