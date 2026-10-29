import { describe, expect, it } from "vitest";
import {
  $createParagraphNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  createEditor,
  type LexicalNode,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $isLinkNode,
  LinkNode,
} from "@payloadcms/richtext-lexical/lexical/link";

import { $applyArticlePaste } from "./article-paste";
import { $isVideoNode, VideoNode } from "./nodes/video-node";

function editor() {
  const next = createEditor({
    namespace: "article-paste-test",
    nodes: [LinkNode, VideoNode],
    onError: (error) => {
      throw error;
    },
  });
  next.setRootElement(document.createElement("div"));
  next.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().clear();
      $getRoot().append(paragraph);
      paragraph.select();
    },
    { discrete: true },
  );
  return next;
}

function walk(node: LexicalNode, visit: (node: LexicalNode) => void) {
  visit(node);
  if ($isElementNode(node))
    node.getChildren().forEach((child) => walk(child, visit));
}

describe("article paste", () => {
  it("turns a pasted URL into a video block", () => {
    const next = editor();
    next.update(
      () => {
        const paragraph = $getRoot().getFirstChild();
        if ($isElementNode(paragraph)) paragraph.select();
        expect($applyArticlePaste("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
      },
      { discrete: true },
    );
    const video = next.getEditorState().read(() => $getRoot().getFirstChild());
    expect($isVideoNode(video)).toBe(true);
    if ($isVideoNode(video)) {
      expect(video.getUrl()).toBe("https://youtu.be/dQw4w9WgXcQ");
    }
  });

  it("turns pasted markdown links and emphasis into marks", () => {
    const next = editor();
    next.update(
      () => {
        const paragraph = $getRoot().getFirstChild();
        if ($isElementNode(paragraph)) paragraph.select();
        expect(
          $applyArticlePaste(
            "Watch [Sam](https://schooltv.nl/video-item/sam) eat *ontbijt*.",
          ),
        ).toBe(true);
      },
      { discrete: true },
    );
    const found = next.getEditorState().read(() => {
      const links: string[] = [];
      const italic: string[] = [];
      walk($getRoot(), (node) => {
        if ($isLinkNode(node)) links.push(node.getURL());
        if ($isTextNode(node) && node.getTextContent() === "ontbijt") {
          italic.push(String(node.getFormat()));
        }
      });
      return { links, italic };
    });
    expect(found.links).toEqual(["https://schooltv.nl/video-item/sam"]);
    expect(found.italic).toEqual(["2"]);
  });

  it("leaves an ordinary sentence for Lexical to paste", () => {
    const next = editor();
    next.update(() => {
      expect($applyArticlePaste("Sam eats breakfast.")).toBe(false);
    });
  });
});
