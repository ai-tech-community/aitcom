import {
  $createParagraphNode,
  $createTextNode,
  ElementNode,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
} from "@payloadcms/richtext-lexical/lexical";

import { admonitionBorderClass } from "@/lib/lexical-blocks";

export type AdmonitionVariant = "INFO" | "WARNING" | "SUCCESS";

export type SerializedAdmonitionNode = SerializedElementNode & {
  type: "admonition";
  variant: string;
  spacing: string;
};

/**
 * Editor-only callout. Stored articles keep a normal paragraph that starts
 * with `[!INFO]` (the public renderer reads that). Load lifts the paragraph
 * into this node; save writes the marker back.
 */
export class AdmonitionNode extends ElementNode {
  __variant: string;
  __spacing: string;

  static getType(): string {
    return "admonition";
  }

  static clone(node: AdmonitionNode): AdmonitionNode {
    return new AdmonitionNode(node.__variant, node.__spacing, node.__key);
  }

  constructor(variant = "INFO", spacing = " ", key?: NodeKey) {
    super(key);
    this.__variant = variant;
    this.__spacing = spacing;
  }

  static importJSON(json: SerializedAdmonitionNode): AdmonitionNode {
    return new AdmonitionNode(json.variant || "INFO", json.spacing ?? " ");
  }

  exportJSON(): SerializedAdmonitionNode {
    return {
      ...super.exportJSON(),
      type: "admonition",
      variant: this.__variant,
      spacing: this.__spacing,
    };
  }

  createDOM(): HTMLElement {
    const el = document.createElement("aside");
    el.dataset.admonition = this.__variant;
    el.setAttribute("role", "note");
    el.setAttribute("aria-label", this.__variant);
    el.className = [
      "text-foreground my-4 rounded border px-4 py-3",
      admonitionBorderClass(this.__variant),
      "before:mb-1 before:block before:font-mono before:text-xs before:tracking-wider before:content-[attr(data-admonition)]",
      "[&_p]:mb-0",
    ].join(" ");
    return el;
  }

  updateDOM(prev: AdmonitionNode, dom: HTMLElement): boolean {
    if (prev.__variant !== this.__variant) {
      dom.dataset.admonition = this.__variant;
      dom.setAttribute("aria-label", this.__variant);
      dom.className = [
        "text-foreground my-4 rounded border px-4 py-3",
        admonitionBorderClass(this.__variant),
        "before:mb-1 before:block before:font-mono before:text-xs before:tracking-wider before:content-[attr(data-admonition)]",
        "[&_p]:mb-0",
      ].join(" ");
    }
    return false;
  }

  isInline(): false {
    return false;
  }
}

const PLACEHOLDER: Record<AdmonitionVariant, string> = {
  INFO: "Short info title",
  WARNING: "Important warning",
  SUCCESS: "Good practice",
};

export function $createAdmonitionNode(
  variant: AdmonitionVariant,
  text = PLACEHOLDER[variant],
): AdmonitionNode {
  const node = new AdmonitionNode(variant, " ");
  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode(text));
  node.append(paragraph);
  return node;
}

export function $isAdmonitionNode(
  node: LexicalNode | null | undefined,
): node is AdmonitionNode {
  return node instanceof AdmonitionNode;
}
