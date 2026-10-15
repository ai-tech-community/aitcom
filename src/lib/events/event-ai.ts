/**
 * AI flag for one event, read from the title, summary, and description
 * the event already stores.
 *
 * True means that text has an AI signal: AI itself, ML, LLMs, agents,
 * GPUs and NVIDIA, automation, data science, and the same family of words.
 * False means the text describes some other subject. Null means the text
 * does not settle it (empty, a placeholder, or only a name, place, and
 * date). An ambiguous title stays null rather than being stored as not-AI.
 *
 * A false or null flag never drops the event. Discovery still needs a real
 * source link, and this function does not invent one.
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
  /\bdata[\s-]?science\b/i,
  /\bdatawetenschap\b/i,
  /\bchatbots?\b/i,
  /\btransformer models?\b/i,
  /\btransformers?\b/i,
  /\bneural\b/i,
  /\bnvidia\b/i,
  /\bgpus?\b/i,
  /\bcuda\b/i,
  /\bautomat(?:e|ed|es|ing|ion|ions)\b/i,
  /\bautomatisering\b/i,
  /\bagentic\b/i,
  /\bagents?\b/i,
  /\bbots?\b/i,
  /\brobots?\b/i,
  /\brobotics\b/i,
  /\bgrok\b/i,
  /\bmodel context protocol\b/i,
  /\bgenerative\b/i,
  /\bcopilot\b/i,
  /\bclaude\b/i,
  /\bgemini\b/i,
  /\banthropic\b/i,
  /\bmistral\b/i,
  /\bllama\b/i,
  /\bdeepmind\b/i,
  /\bstable diffusion\b/i,
];

/**
 * A subject that is not an AI signal. With no AI signal, this is a confident
 * not-AI reading. Without one of these, a title that never says what the
 * event is about stays null.
 */
const OTHER_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\bpotter(?:y|ies)\b/i,
  /\bclays?\b/i,
  /\bglazes?\b/i,
  /\bpaint(?:ing|ers?|s)?\b/i,
  /\bbudgets?\b/i,
  /\bfairs?\b/i,
  /\bmarkets?\b/i,
  /\bneighbourhoods?\b/i,
  /\bneighborhoods?\b/i,
  /\bmusic\b/i,
  /\bdanc(?:e|ing)\b/i,
  /\bcoffees?\b/i,
  /\bcaf[eé]s?\b/i,
  /\braves?\b/i,
  /\bblockchain\b/i,
  /\bcrypto(?:currency)?\b/i,
  /\bstablecoins?\b/i,
  /\btokeniz(?:e|ed|ation)\b/i,
  /\bdefi\b/i,
  /\bbitcoins?\b/i,
  /\bethereum\b/i,
  /\bon-?chain\b/i,
  /\bdigital assets?\b/i,
  /\bwallets?\b/i,
  /\bphones?\b/i,
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

/**
 * True when the stored text has an AI signal. False when it describes
 * another subject. Null when the title and summary do not settle it.
 */
export function classifyEventAi(
  title: string,
  description: string | null | undefined,
  summary?: string | null,
): boolean | null {
  const text = eventTextForAi(title, description, summary);
  if (!text) return null;
  if (AI_EVENT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (OTHER_SUBJECT_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  return null;
}

export type ClassifiableEvent = {
  id: number;
  title: string;
  description: string | null;
  summary?: string | null;
};

/**
 * Split a batch. Ambiguous rows are listed separately and stay null so a
 * later reading can still classify them.
 */
export function groupEventAiUpdates(rows: readonly ClassifiableEvent[]): {
  ai: number[];
  notAi: number[];
  ambiguous: number[];
} {
  const ai: number[] = [];
  const notAi: number[] = [];
  const ambiguous: number[] = [];
  for (const row of rows) {
    const reading = classifyEventAi(row.title, row.description, row.summary);
    if (reading === true) ai.push(row.id);
    else if (reading === false) notAi.push(row.id);
    else ambiguous.push(row.id);
  }
  return { ai, notAi, ambiguous };
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
