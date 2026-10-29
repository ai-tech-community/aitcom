/**
 * Inline markdown that agents paste into article text: links and emphasis.
 * Headings and lists stay the caller's job. Read-time rendering uses the
 * same split so stored asterisks and `[text](url)` show as marks without
 * rewriting the saved document.
 */

import { resolveArticleVideo, safeHttpUrl } from "./video-embed";

const BOLD = 1;
const ITALIC = 2;

export type InlinePiece =
  | { kind: "text"; text: string; format: number }
  | { kind: "link"; text: string; url: string };

const INLINE =
  /(\*\*([^*\n]+?)\*\*)|(__([^_\n]+?)__)|((?<![\w*])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![\w*]))|((?<![\w_])_([^_\s](?:[^_\n]*[^_\s])?)_(?![\w_]))|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/g;

function linkUrl(raw: string): string | null {
  const url = safeHttpUrl(raw);
  return url ? url.toString() : null;
}

/** Split one line into text, emphasis, and links. Plain text comes back as one piece. */
export function parseInlineMarkdown(source: string): InlinePiece[] {
  const pieces: InlinePiece[] = [];
  let cursor = 0;
  for (const match of source.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      pieces.push({
        kind: "text",
        text: source.slice(cursor, start),
        format: 0,
      });
    }
    const bold = match[2] ?? match[4];
    const italic = match[6] ?? match[8];
    const label = match[10];
    const href = match[11];
    if (bold !== undefined && match[1]) {
      pieces.push({ kind: "text", text: bold, format: BOLD });
    } else if (bold !== undefined && match[3]) {
      pieces.push({ kind: "text", text: bold, format: BOLD });
    } else if (italic !== undefined) {
      pieces.push({ kind: "text", text: italic, format: ITALIC });
    } else if (label && href) {
      const url = linkUrl(href);
      if (url) pieces.push({ kind: "link", text: label, url });
      else pieces.push({ kind: "text", text: match[0], format: 0 });
    } else {
      pieces.push({ kind: "text", text: match[0], format: 0 });
    }
    cursor = start + match[0].length;
  }
  if (cursor < source.length) {
    pieces.push({ kind: "text", text: source.slice(cursor), format: 0 });
  }
  if (pieces.length === 0) {
    return [{ kind: "text", text: source, format: 0 }];
  }
  return pieces;
}

export function hasInlineMarkdown(source: string): boolean {
  return parseInlineMarkdown(source).some(
    (piece) => piece.kind === "link" || piece.format !== 0,
  );
}

export type PastePlan =
  | { kind: "default" }
  | { kind: "video"; url: string }
  | { kind: "markdown"; text: string };

/**
 * What a paste into the article editor should become. A lone http(s) URL
 * becomes a video block (player or link card). Markdown links and emphasis
 * become real nodes. Anything else stays Lexical's own paste.
 */
export function planPaste(text: string): PastePlan {
  const normalized = text.replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();
  if (trimmed && !/\s/.test(trimmed) && resolveArticleVideo(trimmed)) {
    return { kind: "video", url: trimmed };
  }
  if (hasInlineMarkdown(normalized))
    return { kind: "markdown", text: normalized };
  return { kind: "default" };
}
