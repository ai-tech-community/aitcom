/**
 * @mentions in a feed post. The text says "@Jane Doe" in plain words (so it
 * reads fine anywhere: agents, MCP, email); the post also stores who each
 * mention points at, as the server checked it. These rules are shared by
 * the server (which keeps the list in step with the text) and the screen
 * (which turns each "@Name" into a link).
 */

/** One member a post mentions, by the name written in its text. */
export type PostMention = { userId: string; name: string };

/** The most members one post may mention. */
export const MAX_POST_MENTIONS = 10;

/** A letter or digit right after "@Name" means it was a longer name. */
const NAME_CHAR = /[\p{L}\p{N}_]/u;

/** Where "@name" is written in `text` as a whole name, from `from` on. */
function indexOfMention(text: string, name: string, from = 0): number {
  const token = `@${name}`;
  let at = text.indexOf(token, from);
  while (at !== -1) {
    const next = text[at + token.length];
    const before = at > 0 ? text[at - 1] : undefined;
    const cleanEnd = next === undefined || !NAME_CHAR.test(next);
    // "mail@Jane" is an address, not a mention.
    const cleanStart = before === undefined || !NAME_CHAR.test(before);
    if (cleanEnd && cleanStart) return at;
    at = text.indexOf(token, at + 1);
  }
  return -1;
}

/**
 * The mentions whose "@Name" still appears in `text`: one per member, in
 * the order given, at most MAX_POST_MENTIONS. Taking a name out of the text
 * takes the mention out. Where one name is the start of another ("@Jane
 * Doe" holds "@Jane"), the text mentions the longer one only, as shown.
 */
export function mentionsIn(
  text: string,
  mentions: readonly PostMention[],
): PostMention[] {
  const written = new Set(
    splitMentions(
      text,
      mentions.filter((mention) => mention.name),
    ).flatMap((part) => (part.mention ? [part.mention] : [])),
  );
  const seen = new Set<string>();
  const kept: PostMention[] = [];
  for (const mention of mentions) {
    if (kept.length >= MAX_POST_MENTIONS) break;
    if (!written.has(mention) || seen.has(mention.userId)) continue;
    seen.add(mention.userId);
    kept.push(mention);
  }
  return kept;
}

/**
 * Reads a stored mention list (a JSON column) without trusting its shape:
 * anything that is not a { userId, name } of strings is left out.
 */
export function readMentions(value: unknown): PostMention[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { userId, name } = item as Record<string, unknown>;
    return typeof userId === "string" &&
      typeof name === "string" &&
      userId &&
      name
      ? [{ userId, name }]
      : [];
  });
}

export type MentionPart<M extends PostMention = PostMention> =
  | { text: string; mention?: undefined }
  | { text: string; mention: M };

/**
 * Splits a piece of post text into plain runs and "@Name" mentions, for
 * rendering. Where two names start at the same place ("@Jane" and "@Jane
 * Doe") the longer one wins.
 */
export function splitMentions<M extends PostMention>(
  text: string,
  mentions: readonly M[],
): MentionPart<M>[] {
  if (mentions.length === 0 || !text.includes("@")) return [{ text }];
  const longestFirst = [...mentions].sort(
    (a, b) => b.name.length - a.name.length,
  );
  const parts: MentionPart<M>[] = [];
  let at = 0;
  while (at < text.length) {
    let found: { index: number; mention: M } | null = null;
    for (const mention of longestFirst) {
      const index = indexOfMention(text, mention.name, at);
      if (index !== -1 && (found === null || index < found.index)) {
        found = { index, mention };
      }
    }
    if (!found) break;
    if (found.index > at) parts.push({ text: text.slice(at, found.index) });
    const end = found.index + found.mention.name.length + 1;
    parts.push({ text: text.slice(found.index, end), mention: found.mention });
    at = end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/**
 * The "@query" being typed just before the caret, if any: an "@" at the
 * start of the text or after a space or bracket, followed by up to 30
 * characters with no line break. Spaces are allowed, since names have them.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /[\n@]/.test(query) || query.startsWith(" ")) {
    return null;
  }
  const lead = at > 0 ? before[at - 1]! : "";
  if (lead && !/[\s([{]/.test(lead)) return null;
  return { start: at, query };
}
