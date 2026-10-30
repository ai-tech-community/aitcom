/**
 * Agent lesson bodies are markdown. The rich-text field stores one paragraph
 * per line, so a newline is a paragraph boundary and is not collapsed.
 *
 * Lessons saved before that still keep their newlines inside a paragraph
 * (blank lines split paragraphs). Reading those back does not rewrite the row.
 */

import type { Lesson } from "@/payload-types";

type TextNode = {
  type?: string;
  text?: string;
  format?: number;
  children?: TextNode[];
};

type LexicalRoot = {
  root?: { children?: TextNode[] };
};

function textNode(line: string) {
  return {
    type: "text" as const,
    text: line,
    version: 1,
    format: 0,
    detail: 0,
    mode: "normal" as const,
    style: "",
  };
}

function paragraphNode(line: string) {
  return {
    type: "paragraph" as const,
    version: 1,
    format: "" as const,
    indent: 0,
    direction: "ltr" as const,
    textFormat: 0,
    textStyle: "",
    children: [textNode(line)],
  };
}

/** Store markdown without joining lines or trimming them. */
export function lessonMarkdownToLexical(
  body: string,
): NonNullable<Lesson["body"]> {
  const lines = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr",
      format: "",
      indent: 0,
      children: lines.map(paragraphNode),
    },
  };
}

function parseBody(body: unknown): LexicalRoot | null {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as LexicalRoot;
    } catch {
      return null;
    }
  }
  return body && typeof body === "object" ? (body as LexicalRoot) : null;
}

/**
 * The text of one plain paragraph, or null when the paragraph has emphasis,
 * a link, or any other rich node. Line breaks inside it stay newlines.
 */
function plainParagraph(node: TextNode): string | null {
  if (node.type !== "paragraph") return null;
  const children = node.children ?? [];
  let text = "";
  for (const child of children) {
    if (child.type === "linebreak") {
      text += "\n";
      continue;
    }
    if (child.type !== "text" || typeof child.text !== "string") return null;
    if (child.format) return null;
    text += child.text;
  }
  return text;
}

function plainParagraphs(body: unknown): string[] | null {
  const children = parseBody(body)?.root?.children;
  if (!Array.isArray(children)) return null;
  const paragraphs: string[] = [];
  for (const child of children) {
    const text = plainParagraph(child);
    if (text === null) return null;
    paragraphs.push(text);
  }
  return paragraphs;
}

function looksLikeMarkdown(source: string): boolean {
  return (
    /(^|\n)#{1,6} \S/.test(source) ||
    source.includes("```") ||
    /(^|\n)\s*\|.+\|/.test(source) ||
    /(^|\n)\s*[-*+] \S/.test(source) ||
    /(^|\n)\s*\d+\. \S/.test(source) ||
    /\[[^\]\n]+\]\(https?:\/\//.test(source) ||
    /\*\*\S[^*\n]*\S\*\*|\*\*\S\*\*/.test(source)
  );
}

function blockSignals(source: string): number {
  let count = 0;
  if (/(^|\s)#{1,6} \S/.test(source)) count += 1;
  if (source.includes("```")) count += 1;
  if (/\|[^\n|]+\|/.test(source) && /-{3,}/.test(source)) count += 1;
  return count;
}

/**
 * Markdown to render, or null when the body is rich text (or markdown whose
 * line breaks were already replaced with spaces).
 *
 * A paragraph that still contains newlines is an older save: paragraphs join
 * with a blank line, which is how they were split. A paragraph per line joins
 * with a single newline.
 */
export function lessonMarkdownSource(body: unknown): string | null {
  const paragraphs = plainParagraphs(body);
  if (!paragraphs) return null;
  const internalNewlines = paragraphs.some((paragraph) =>
    paragraph.includes("\n"),
  );
  const source = internalNewlines
    ? paragraphs.join("\n\n")
    : paragraphs.join("\n");
  if (
    !internalNewlines &&
    blockSignals(source) >= 2 &&
    !source.includes("\n")
  ) {
    return null;
  }
  if (!internalNewlines && !looksLikeMarkdown(source)) return null;
  return source;
}

/**
 * True when the stored text still has markdown block markers but no newline
 * left to separate them. Those rows are not rewritten; the author re-saves.
 */
export function lessonMarkdownNeedsResave(body: unknown): boolean {
  const paragraphs = plainParagraphs(body);
  if (!paragraphs) return false;
  if (paragraphs.some((paragraph) => paragraph.includes("\n"))) return false;
  const source = paragraphs.join("\n");
  return !source.includes("\n") && blockSignals(source) >= 2;
}
