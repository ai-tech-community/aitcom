/**
 * Shared Lexical rich-text helpers.
 *
 * Extracted from `scripts/seed-demo-challenge.ts` so every part of the
 * challenge engine (seed scripts, AI agent, API routes) can build
 * Lexical JSON without duplicating boilerplate.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type LexicalNode = {
  type: string;
  version: number;
  [k: string]: unknown;
};

// ── Inline / leaf nodes ─────────────────────────────────────────────────────

/** Create a Lexical text node. `format` is a bitmask (1 = bold, 2 = italic, …). */
export function text(t: string, format = 0): LexicalNode {
  return { type: "text", text: t, version: 1, format };
}

// ── Block-level nodes ───────────────────────────────────────────────────────

/** Create a paragraph node wrapping the given children. */
export function paragraph(...children: LexicalNode[]): LexicalNode {
  return {
    type: "paragraph",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}

/** Create a heading node (`h1`–`h6`) wrapping the given children. */
export function heading(tag: string, ...children: LexicalNode[]): LexicalNode {
  return {
    type: "heading",
    tag,
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}

/** Create a single list-item node. Used internally by `bulletList` / `numberedList`. */
export function listItem(t: string, value: number): LexicalNode {
  return {
    type: "listitem",
    version: 1,
    value,
    indent: 0,
    format: "",
    direction: "ltr",
    children: [text(t)],
  };
}

/** Create a bullet (unordered) list from plain-text items. */
export function bulletList(...items: string[]): LexicalNode {
  return {
    type: "list",
    version: 1,
    listType: "bullet",
    tag: "ul",
    start: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children: items.map((t, i) => listItem(t, i + 1)),
  };
}

/** Create a numbered (ordered) list from plain-text items. */
export function numberedList(...items: string[]): LexicalNode {
  return {
    type: "list",
    version: 1,
    listType: "number",
    tag: "ol",
    start: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children: items.map((t, i) => listItem(t, i + 1)),
  };
}

/** Create a code block (Payload Lexical "block" node with blockType "Code"). */
export function codeBlock(language: string, code: string): LexicalNode {
  const uid = Math.random().toString(36).slice(2, 11);
  return {
    type: "block",
    version: 2,
    format: "",
    fields: { id: uid, blockName: "", blockType: "Code", language, code },
  };
}

/** Create a horizontal rule node. */
export function hr(): LexicalNode {
  return { type: "horizontalrule", version: 1 };
}

// ── Root wrapper ────────────────────────────────────────────────────────────

/** Wrap children in the top-level Lexical root structure expected by Payload. */
export function lexical(...children: LexicalNode[]) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      children,
    },
  };
}

// ── Convenience converters ──────────────────────────────────────────────────

/**
 * Convert a plain-text description into Lexical rich text.
 *
 * Paragraphs are separated by double newlines (`\n\n`).
 * Single newlines within a paragraph are preserved as separate text runs
 * joined by a single space.
 *
 * Example:
 * ```
 * plainTextToLexical("Hello world.\n\nSecond paragraph.")
 * ```
 */
export function plainTextToLexical(description: string) {
  const paragraphs = description
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  return lexical(...paragraphs.map((p) => paragraph(text(p))));
}

/**
 * Convert Lexical rich text back into plain text — the inverse of
 * `plainTextToLexical`, used to pre-fill plain-text edit forms. Walks the node
 * tree collecting `text` leaves; top-level blocks (paragraphs, headings, list
 * items) are separated by double newlines. Returns "" for empty/invalid input.
 */
export function lexicalToPlainText(value: unknown): string {
  const root = (value as { root?: { children?: unknown[] } } | null)?.root;
  if (!root || !Array.isArray(root.children)) return "";

  const collectText = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { type?: string; text?: unknown; children?: unknown[] };
    if (n.type === "text" && typeof n.text === "string") return n.text;
    if (Array.isArray(n.children)) {
      return n.children.map(collectText).join("");
    }
    return "";
  };

  return root.children
    .map(collectText)
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}
