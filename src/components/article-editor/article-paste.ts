import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalNode,
} from "@payloadcms/richtext-lexical/lexical";
import { $createLinkNode } from "@payloadcms/richtext-lexical/lexical/link";

import { parseInlineMarkdown, planPaste } from "@/lib/articles/inline-markdown";

import { $insertTopLevel } from "./insert-top-level";
import { $createVideoNode } from "./nodes/video-node";

function piecesToNodes(source: string): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  for (const piece of parseInlineMarkdown(source)) {
    if (piece.kind === "link") {
      const link = $createLinkNode(piece.url, {
        target: "_blank",
        rel: "noopener noreferrer",
      });
      link.append($createTextNode(piece.text));
      nodes.push(link);
      continue;
    }
    if (!piece.text) continue;
    const text = $createTextNode(piece.text);
    if (piece.format) text.setFormat(piece.format);
    nodes.push(text);
  }
  return nodes;
}

/** Insert a video block at the caret, or at the end when the editor has no selection. */
export function $insertVideoBlock(url = ""): void {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    $insertTopLevel([$createVideoNode(url)]);
    return;
  }
  const video = $createVideoNode(url);
  const last = $getRoot().getLastChild();
  if (last) last.insertAfter(video);
  else $getRoot().append(video);
  const caret = $createParagraphNode();
  video.insertAfter(caret);
  caret.select();
}

/**
 * Apply a paste that this editor handles itself. Call inside `editor.update`.
 * Returns false when Lexical should paste as usual.
 */
export function $applyArticlePaste(text: string): boolean {
  const plan = planPaste(text);
  switch (plan.kind) {
    case "default":
      return false;
    case "video":
      $insertVideoBlock(plan.url);
      return true;
    case "markdown": {
      const lines = plan.text
        .split("\n")
        .filter((line) => line.trim().length > 0);
      if (lines.length === 0) return false;
      const first = lines[0];
      if (lines.length === 1 && first !== undefined) {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        selection.insertNodes(piecesToNodes(first));
        return true;
      }
      $insertTopLevel(
        lines.map((line) => {
          const paragraph = $createParagraphNode();
          for (const node of piecesToNodes(line)) paragraph.append(node);
          return paragraph;
        }),
      );
      return true;
    }
    default: {
      const unreachable: never = plan;
      return unreachable;
    }
  }
}
