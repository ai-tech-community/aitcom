import {
  lexical,
  text,
  type LexicalNode,
} from "@/server/challenge-engine/lexical";

const BOLD = 1;
const ITALIC = 2;
const CODE = 16;

/**
 * The markdown the forum form's toolbar inserts, stored as Lexical so the
 * thread reader shows links, emphasis, and lists. The agent create-thread
 * tool and the form both save through this.
 */
export function forumBodyToLexical(body: string) {
  const blocks = blocksOf(body);
  const children = blocks.length > 0 ? blocks : [paragraphOf([text("")])];
  return lexical(...children);
}

function blocksOf(body: string): LexicalNode[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: LexicalNode[] = [];
  let paragraph: string[] = [];
  let list: { kind: "bullet" | "number"; items: string[] } | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    paragraph = [];
    if (text) blocks.push(paragraphOf(inlineNodes(text)));
  };
  const flushList = () => {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    blocks.push(listOf(list.kind, list.items.map(inlineNodes)));
    list = null;
  };

  for (const line of lines) {
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? "bullet" : "number";
      const item = bullet?.[1] ?? numbered?.[1] ?? "";
      // `list` is also assigned inside flushList, so optional chaining here
      // collapses the type. The explicit check is the one that typechecks.
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push(item);
      continue;
    }
    flushList();
    if (line.trim().length === 0) flushParagraph();
    else paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

function paragraphOf(children: LexicalNode[]): LexicalNode {
  return {
    type: "paragraph",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    textFormat: 0,
    textStyle: "",
    children,
  };
}

function listOf(
  kind: "bullet" | "number",
  items: LexicalNode[][],
): LexicalNode {
  return {
    type: "list",
    version: 1,
    listType: kind === "bullet" ? "bullet" : "number",
    tag: kind === "bullet" ? "ul" : "ol",
    start: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children: items.map((children, index) => ({
      type: "listitem",
      version: 1,
      value: index + 1,
      indent: 0,
      format: "",
      direction: "ltr",
      children,
    })),
  };
}

const TOKEN =
  /(`[^`\n]+`)|(\*\*(.+?)\*\*)|(_([^_\n]+)_|(?<!\*)\*([^*\n]+)\*(?!\*))|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<]+)/g;

function inlineNodes(source: string): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  let cursor = 0;
  for (const match of source.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text(source.slice(cursor, start)));
    if (match[1]) nodes.push(text(match[1].slice(1, -1), CODE));
    else if (match[2]) nodes.push(text(match[3] ?? "", BOLD));
    else if (match[4]) nodes.push(text(match[5] ?? match[6] ?? "", ITALIC));
    else if (match[7]) nodes.push(linkNode(match[8] ?? "", match[9] ?? ""));
    else if (match[10]) {
      const trimmed = match[10].replace(/[.,);:]+$/, "");
      const rest = match[10].slice(trimmed.length);
      nodes.push(linkNode(trimmed, trimmed));
      if (rest) nodes.push(text(rest));
    }
    cursor = start + match[0].length;
  }
  if (cursor < source.length) nodes.push(text(source.slice(cursor)));
  return nodes.length > 0 ? nodes : [text("")];
}

function linkNode(label: string, url: string): LexicalNode {
  return {
    type: "link",
    version: 3,
    direction: "ltr",
    format: "",
    indent: 0,
    url,
    fields: { url, newTab: true, linkType: "custom" },
    children: [text(label)],
  };
}
