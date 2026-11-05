import { richTextSnippet } from "@/server/agent/knowledge-search";

/**
 * Words that show up in question titles without naming the topic.
 * A share has to hit the remaining words, so a news item that never
 * mentions the question is rejected.
 */
const STOP = new Set([
  "about",
  "above",
  "across",
  "actually",
  "after",
  "again",
  "also",
  "around",
  "because",
  "been",
  "before",
  "being",
  "both",
  "could",
  "does",
  "doing",
  "done",
  "dont",
  "each",
  "from",
  "have",
  "having",
  "here",
  "into",
  "just",
  "more",
  "most",
  "once",
  "only",
  "onto",
  "other",
  "over",
  "really",
  "should",
  "show",
  "some",
  "still",
  "such",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "using",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "within",
  "without",
  "would",
  "your",
  "yours",
]);

/** Plain text from a string or a Payload Lexical document. */
export function forumPlainText(field: unknown): string {
  if (typeof field === "string") return field;
  return richTextSnippet(field, 20_000);
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Plural folding only. "production" must not match "product". */
function stem(word: string): string {
  if (word.endsWith("ss") || word.length < 5) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function contentStems(text: string): Set<string> {
  const stems = new Set<string>();
  for (const token of tokens(text)) {
    const folded = stem(token);
    if (folded.length < 4 || STOP.has(token) || STOP.has(folded)) continue;
    stems.add(folded);
  }
  return stems;
}

/**
 * True when the share uses at least two topic words from the thread title
 * (one, when the title only has one). The body is the fallback for a title
 * that is all question words. Unrelated news fails this check.
 */
export function shareReferencesThreadTopic(
  threadTitle: string,
  threadBody: string,
  shareText: string,
): boolean {
  const share = contentStems(shareText);
  const titleTerms = [...contentStems(threadTitle)];
  const hits = (terms: string[]) => terms.filter((term) => share.has(term));
  if (titleTerms.length >= 2) return hits(titleTerms).length >= 2;
  const pool = [...new Set([...titleTerms, ...contentStems(threadBody)])];
  if (pool.length === 0) return false;
  const needed = pool.length >= 2 ? 2 : 1;
  return hits(pool).length >= needed;
}

export function threadTopic(thread: { title?: unknown; content?: unknown }): {
  title: string;
  body: string;
} {
  return {
    title: typeof thread.title === "string" ? thread.title : "",
    body: forumPlainText(thread.content),
  };
}

/**
 * A stored reply starts the per-thread cooldown only when it actually
 * addresses the thread. An off-topic knowledge share that was posted
 * earlier does not, so a corrective reply can still land.
 */
export function replyStartsAgentCooldown(
  replyContent: unknown,
  threadTitle: string,
  threadBody: string,
): boolean {
  return shareReferencesThreadTopic(
    threadTitle,
    threadBody,
    forumPlainText(replyContent),
  );
}

export function countsTowardReplyCooldown(
  reply: { authorId?: string | null; content?: unknown } | null | undefined,
  agentId: string,
  thread: { title?: unknown; content?: unknown },
): boolean {
  if (reply?.authorId !== agentId) return false;
  const topic = threadTopic(thread);
  return replyStartsAgentCooldown(reply.content, topic.title, topic.body);
}
