/**
 * Pure rules for article rich text that the editor, the save step and the
 * reader all share: admonition markers, and the empty paragraphs Lexical
 * leaves beside blocks.
 */

export type LexicalLikeNode = {
  type?: string;
  text?: string;
  version?: number;
  detail?: number;
  format?: number;
  mode?: string;
  style?: string;
  variant?: string;
  spacing?: string;
  children?: LexicalLikeNode[];
  fields?: { blockType?: string };
};

/** `[!INFO]` plus the exact whitespace that followed it, so a save can put it back. */
const ADMONITION_MARKER = /^\[!([A-Z]+)\](\s*)/;

function plainText(nodes: readonly LexicalLikeNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return "";
  return nodes
    .map((node) => {
      if (typeof node.text === "string") return node.text;
      return plainText(node.children);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A paragraph with no visible text. Line breaks and blank text count as empty. */
export function isEmptyParagraph(node: LexicalLikeNode): boolean {
  return node.type === "paragraph" && plainText(node.children).length === 0;
}

/**
 * Drop empty paragraphs.
 *
 * They are not content. `articleBodyToLexical` used to store each blank line
 * of an agent's markdown as its own paragraph, so a draft with a blank line
 * between blocks (and two around a list or a `[!INFO]` line) loaded as a run
 * of empty `<p>`s. Paragraph margin already separates blocks, including
 * lists and callouts. A document that is only empty paragraphs keeps one, so
 * an untouched editor still has a place to type.
 */
export function stripStrayEmptyParagraphs<T extends LexicalLikeNode>(
  nodes: readonly T[],
): T[] {
  const kept = nodes.filter((node) => !isEmptyParagraph(node));
  if (kept.length > 0) return kept;
  const empty = nodes.find((node) => isEmptyParagraph(node));
  return empty ? [empty] : [];
}

export function countEmptyParagraphs(
  nodes: readonly LexicalLikeNode[],
): number {
  return nodes.filter((node) => isEmptyParagraph(node)).length;
}

/**
 * An admonition paragraph starts with `[!INFO]` (or WARNING / SUCCESS / …).
 * The marker is editor syntax; everything after it, including links, is the
 * callout body.
 */
export function splitAdmonition<T extends LexicalLikeNode>(
  children: readonly T[],
): { variant: string; spacing: string; body: T[] } | null {
  const start = children.findIndex(
    (child) => child.type === "text" && (child.text ?? "").trim().length > 0,
  );
  if (start < 0) return null;
  const leading = children.slice(0, start);
  if (
    leading.some((child) => child.type !== "text" && child.type !== "linebreak")
  ) {
    return null;
  }
  const first = children[start];
  if (!first) return null;
  const raw = first.text ?? "";
  const trimmed = raw.trimStart();
  const match = ADMONITION_MARKER.exec(trimmed);
  const variant = match?.[1];
  if (!match || !variant) return null;
  const spacing = match[2] ?? "";
  const rest = trimmed.slice(match[0].length);
  const body: T[] = [];
  if (rest.length > 0) body.push({ ...first, text: rest });
  body.push(...children.slice(start + 1));
  return { variant, spacing, body };
}

/** Border classes shared by the public callout and the editor callout. */
export function admonitionBorderClass(variant: string): string {
  switch (variant) {
    case "INFO":
      return "border-info/60 bg-info/10";
    case "WARNING":
      return "border-warning/60 bg-warning/10";
    case "SUCCESS":
      return "border-success/60 bg-success/10";
    default:
      return "border-border bg-muted";
  }
}

/**
 * A stored `[!INFO] …` paragraph becomes an editor callout. The marker is
 * kept as `variant` + `spacing` so saving can restore the same paragraph.
 */
export function liftAdmonitionParagraph<T extends LexicalLikeNode>(node: T): T {
  if (node.type !== "paragraph") return node;
  const split = splitAdmonition(node.children ?? []);
  if (!split) return node;
  return {
    ...node,
    type: "admonition",
    version: 1,
    variant: split.variant,
    spacing: split.spacing,
    children: [
      {
        ...node,
        type: "paragraph",
        children: split.body,
      },
    ],
  } as unknown as T;
}

function prependMarker<T extends LexicalLikeNode>(
  paragraph: T,
  prefix: string,
): T {
  const children = Array.isArray(paragraph.children)
    ? [...paragraph.children]
    : [];
  const first = children[0];
  if (first?.type === "text" && typeof first.text === "string") {
    children[0] = { ...first, text: prefix + first.text };
  } else {
    children.unshift({
      type: "text",
      text: prefix,
      version: 1,
      detail: 0,
      format: 0,
      mode: "normal",
      style: "",
    });
  }
  return { ...paragraph, type: "paragraph", children };
}

/**
 * An editor callout becomes the stored paragraph again: `[!INFO]` plus the
 * original spacing, then the callout's text and links.
 */
export function flattenAdmonition<T extends LexicalLikeNode>(node: T): T[] {
  if (node.type !== "admonition") return [node];
  const variant = typeof node.variant === "string" ? node.variant : "INFO";
  const spacing = typeof node.spacing === "string" ? node.spacing : " ";
  const prefix = `[!${variant}]${spacing}`;
  const kids = node.children ?? [];
  if (kids.length === 0) {
    return [
      {
        type: "paragraph",
        children: [{ type: "text", text: prefix.trimEnd() }],
      } as T,
    ];
  }
  return kids.map((child, index) => {
    if (index !== 0) return child as T;
    if (child.type === "paragraph") return prependMarker(child as T, prefix);
    return prependMarker({ type: "paragraph", children: [child] } as T, prefix);
  });
}

/** Stored article JSON with empty paragraphs removed. Callouts stay paragraphs. */
export function normalizeStoredContent(content: unknown): unknown {
  if (!content || typeof content !== "object") return content;
  const root = (content as { root?: { children?: LexicalLikeNode[] } }).root;
  if (!root?.children) return content;
  return {
    ...content,
    root: {
      ...root,
      children: stripStrayEmptyParagraphs(root.children),
    },
  };
}
