import { describe, expect, it } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "@payloadcms/richtext-lexical/lexical";

import { $insertTopLevel } from "./insert-top-level";
import { $createImageNode, ImageNode } from "./nodes/image-node";

function mounted() {
  const editor = createEditor({
    namespace: "insert-top-level",
    nodes: [ImageNode],
    onError: (error) => {
      throw error;
    },
  });
  editor.setRootElement(document.createElement("div"));
  return editor;
}

function childrenOf(editor: ReturnType<typeof mounted>) {
  return editor.getEditorState().toJSON().root.children as {
    type: string;
    children?: { text?: string }[];
  }[];
}

describe("$insertTopLevel", () => {
  it("replaces the empty slash paragraph instead of leaving one on each side of an image", () => {
    const editor = mounted();
    editor.update(
      () => {
        const empty = $createParagraphNode();
        $getRoot().clear();
        $getRoot().append(empty);
        empty.select();
        $insertTopLevel([
          $createImageNode("https://example.com/a.png", "diagram"),
        ]);
      },
      { discrete: true },
    );

    const children = childrenOf(editor);
    expect(children[0]?.type).toBe("image");
    expect(children.filter((node) => node.type === "paragraph")).toHaveLength(
      1,
    );
    expect(children.at(-1)?.children ?? []).toEqual([]);
  });

  it("does not leave an empty paragraph in front of an admonition", () => {
    const editor = mounted();
    editor.update(
      () => {
        const empty = $createParagraphNode();
        $getRoot().clear();
        $getRoot().append(empty);
        empty.select();
        const title = $createParagraphNode();
        title.append($createTextNode("[!INFO] Short info title"));
        const body = $createParagraphNode();
        body.append($createTextNode("Explain the context."));
        $insertTopLevel([title, body]);
      },
      { discrete: true },
    );

    const children = childrenOf(editor);
    expect(children.map((node) => node.children?.[0]?.text)).toEqual([
      "[!INFO] Short info title",
      "Explain the context.",
    ]);
  });
});
