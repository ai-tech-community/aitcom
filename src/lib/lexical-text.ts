/**
 * The plain text of Lexical content: one rule for every reader of it. Pure
 * and client-safe (no React, no server imports), so a server validation and
 * the client check that mirrors it share the same code and cannot drift
 * apart.
 */

/** The part of a Lexical node the text rule reads. */
export type LexicalTextNode = {
  text?: string;
  children?: LexicalTextNode[];
};

/** The text of a list of nodes, words joined by single spaces, trimmed. */
export function extractPlainText(nodes: readonly LexicalTextNode[]): string {
  return nodes
    .map((n) => {
      if (typeof n.text === "string") return n.text;
      if (n.children?.length) return extractPlainText(n.children);
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The plain text of a Lexical editor state (`{ root: { children } }`);
 * "" for anything else (null, a string, a malformed value).
 */
export function lexicalPlainText(state: unknown): string {
  const children = (state as { root?: { children?: unknown } } | null)?.root
    ?.children;
  return Array.isArray(children)
    ? extractPlainText(children as LexicalTextNode[])
    : "";
}

/** Whether a Lexical editor state holds some text. */
export function lexicalHasText(state: unknown): boolean {
  return lexicalPlainText(state).length > 0;
}
