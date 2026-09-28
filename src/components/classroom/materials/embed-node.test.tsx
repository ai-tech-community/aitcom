import { describe, expect, it, vi } from "vitest";
import {
  $createParagraphNode,
  $getRoot,
  createEditor,
} from "@payloadcms/richtext-lexical/lexical";

// The extension list also registers the file node, which talks to the API
// only when one is on screen; none is here.
vi.mock("@/trpc/react", () => ({ api: {} }));

import {
  postprocessEditorState,
  preprocessEditorState,
} from "@/components/article-editor/utils";
import { embedBlockNode } from "@/lib/classroom/lesson-body";
import { classroomEditorExtensions } from "./editor-extensions";
import { $createEmbedNode, EmbedNode } from "./embed-node";

const URL =
  "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit";

function newEditor() {
  return createEditor({
    namespace: "embed-node-test",
    nodes: [EmbedNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("EmbedNode ↔ stored Embed block", () => {
  it("saves an inserted Embed node as exactly the stored block shape", () => {
    const editor = newEditor();
    editor.update(
      () => {
        const embed = $createEmbedNode(URL);
        $getRoot().append(embed, $createParagraphNode());
      },
      { discrete: true },
    );

    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
      classroomEditorExtensions,
    ) as unknown as { root: { children: Array<{ fields?: { id: string } }> } };

    const first = saved.root.children[0]!;
    expect(first).toEqual(embedBlockNode(URL, first.fields!.id));
    expect(first.fields!.id).toMatch(/^[a-f0-9]{12}$/);
  });

  it("loads a stored Embed block into an EmbedNode and saves it back unchanged", () => {
    const stored = {
      root: {
        type: "root",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        children: [embedBlockNode(URL, "abc123def456")],
      },
    };

    const editor = newEditor();
    const pre = preprocessEditorState(
      stored as never,
      classroomEditorExtensions,
    )!;
    editor.setEditorState(editor.parseEditorState(pre));

    const node = editor.getEditorState().read(() => $getRoot().getFirstChild());
    expect(node).toBeInstanceOf(EmbedNode);

    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
      classroomEditorExtensions,
    ) as unknown as { root: { children: unknown[] } };
    expect(saved.root.children).toEqual([embedBlockNode(URL, "abc123def456")]);
  });
});
