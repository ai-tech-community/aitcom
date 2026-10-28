/**
 * Pure rules for article rich text that the editor, the save step and the
 * reader all share: admonition markers, and the empty paragraphs Lexical
 * leaves beside blocks.
 */

export type LexicalLikeNode = {
  type?: string;
  text?: string;
  children?: LexicalLikeNode[];
  fields?: { blockType?: string };
};

const ADMONITION_MARKER = /^\[!([A-Z]+)\]\s*/;

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
 * A block the editor inserts as its own unit (image, code, divider, or a
 * Payload block). Empty paragraphs pressed against these are leftovers from
 * insertion, not a blank line the writer asked for.
 */
export function isDecoratorBlock(node: LexicalLikeNode): boolean {
  return (
    node.type === "block" ||
    node.type === "image" ||
    node.type === "code" ||
    node.type === "code-block" ||
    node.type === "horizontalrule"
  );
}

function neighborContent<T extends LexicalLikeNode>(
  nodes: readonly T[],
  index: number,
  direction: 1 | -1,
): T | undefined {
  for (
    let cursor = index + direction;
    cursor >= 0 && cursor < nodes.length;
    cursor += direction
  ) {
    const node = nodes[cursor];
    if (node && !isEmptyParagraph(node)) return node;
  }
  return undefined;
}

/**
 * Drop empty paragraphs that sit against a block (or against only other
 * empties that themselves sit against a block). A blank line between two
 * pieces of writing stays. A document of only empty paragraphs stays, so a
 * not-yet-written article is still a valid editor state.
 */
export function stripStrayEmptyParagraphs<T extends LexicalLikeNode>(
  nodes: readonly T[],
): T[] {
  return nodes.filter((node, index) => {
    if (!isEmptyParagraph(node)) return true;
    const before = neighborContent(nodes, index, -1);
    const after = neighborContent(nodes, index, 1);
    const beforeBlock = before !== undefined && isDecoratorBlock(before);
    const afterBlock = after !== undefined && isDecoratorBlock(after);
    return !beforeBlock && !afterBlock;
  });
}

/**
 * An admonition paragraph starts with `[!INFO]` (or WARNING / SUCCESS / …).
 * The marker is editor syntax; everything after it, including links, is the
 * callout body.
 */
export function splitAdmonition<T extends LexicalLikeNode>(
  children: readonly T[],
): { variant: string; body: T[] } | null {
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
  const rest = trimmed.slice(match[0].length);
  const body: T[] = [];
  if (rest.length > 0) body.push({ ...first, text: rest });
  body.push(...children.slice(start + 1));
  return { variant, body };
}
