import {
  $createParagraphNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  type LexicalNode,
} from "@payloadcms/richtext-lexical/lexical";
import { $isListNode } from "@payloadcms/richtext-lexical/lexical/list";
import {
  $isHeadingNode,
  $isQuoteNode,
} from "@payloadcms/richtext-lexical/lexical/rich-text";

function canPlaceCaret(node: LexicalNode): boolean {
  return (
    $isParagraphNode(node) ||
    $isHeadingNode(node) ||
    $isQuoteNode(node) ||
    $isListNode(node)
  );
}

/**
 * Insert top-level nodes in place of the empty paragraph a slash command was
 * typed in. `selection.insertNodes` leaves that empty paragraph behind and,
 * when the caller also appends a trailing paragraph, a second one. A block
 * that ends the document still gets one caret paragraph so the writer can
 * continue; save and render drop that empty paragraph.
 */
export function $insertTopLevel(nodes: readonly LexicalNode[]): void {
  if (nodes.length === 0) return;
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const [first, ...rest] = nodes;
  if (!first) return;

  const top = selection.anchor.getNode().getTopLevelElement();
  let last: LexicalNode;
  if (top && $isParagraphNode(top) && top.getTextContentSize() === 0) {
    top.replace(first);
    last = first;
    for (const node of rest) {
      last.insertAfter(node);
      last = node;
    }
  } else {
    selection.insertNodes([first, ...rest]);
    last = rest.length > 0 ? rest[rest.length - 1]! : first;
  }

  if (last.getNextSibling() == null && !canPlaceCaret(last)) {
    const caret = $createParagraphNode();
    last.insertAfter(caret);
    caret.select();
    return;
  }

  const next = last.getNextSibling();
  if (next) {
    next.selectStart();
    return;
  }
  if (canPlaceCaret(last)) last.selectEnd();
}
