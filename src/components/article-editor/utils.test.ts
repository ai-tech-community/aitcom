import { describe, expect, it } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  createEditor,
  type LexicalNode,
  type SerializedEditorState,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $createLinkNode,
  $isLinkNode,
  AutoLinkNode,
  LinkNode,
} from "@payloadcms/richtext-lexical/lexical/link";
import {
  filterSlashCommands,
  postprocessEditorState,
  preprocessEditorState,
} from "./utils";

const EMBED = { blockType: "Embed", nodeType: "embed" };
const stored = {
  root: {
    children: [
      {
        type: "block",
        fields: {
          blockType: "Embed",
          url: "https://youtu.be/dQw4w9WgXcQ",
          id: "a",
        },
      },
      { type: "block", fields: { blockType: "Code", code: "x" } },
    ],
  },
} as unknown as SerializedEditorState;

describe("block ↔ node remapping", () => {
  it("keeps today's behaviour without extensions", () => {
    const pre = JSON.parse(preprocessEditorState(stored)!);
    expect(pre.root.children.map((n: { type: string }) => n.type)).toEqual([
      "block",
      "code-block",
    ]);
  });

  it("maps extension blocks to their node type and back", () => {
    const pre = JSON.parse(preprocessEditorState(stored, [EMBED])!);
    expect(pre.root.children.map((n: { type: string }) => n.type)).toEqual([
      "embed",
      "code-block",
    ]);
    const post = postprocessEditorState(pre, [EMBED]) as unknown as {
      root: { children: { type: string }[] };
    };
    expect(post.root.children.map((n) => n.type)).toEqual(["block", "block"]);
  });
});

describe("filterSlashCommands with extra commands", () => {
  const extra = [
    {
      id: "embed",
      label: "Embed slides or video",
      group: "Basic" as const,
      keywords: ["youtube", "slides"],
    },
  ];

  it("finds an extra command by keyword", () => {
    expect(filterSlashCommands("slides", extra).map((c) => c.id)).toContain(
      "embed",
    );
  });

  it("does not add extra commands when none are passed", () => {
    expect(filterSlashCommands("").map((c) => c.id)).not.toContain("embed");
  });
});

describe("link ↔ stored Payload link", () => {
  const URL_ = "https://claude.ai/artifact/QfGAfn6EPmuJngAgwsZoa9";
  const text = (t: string) => ({
    type: "text",
    version: 1,
    text: t,
    format: 0,
    style: "",
    mode: "normal",
    detail: 0,
  });
  const paragraph = (...children: object[]) => ({
    type: "paragraph",
    version: 1,
    direction: "ltr",
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    children,
  });
  const doc = (...children: object[]) =>
    ({
      root: {
        type: "root",
        version: 1,
        direction: "ltr",
        format: "",
        indent: 0,
        children,
      },
    }) as unknown as SerializedEditorState;
  // What Payload's richText field validates and stores.
  const storedLink = (type: "link" | "autolink", newTab: boolean) => ({
    type,
    version: 3,
    direction: "ltr",
    format: "",
    indent: 0,
    fields: { url: URL_, newTab, linkType: "custom" },
    children: [text("cheatsheet")],
  });

  function mountedEditor() {
    const editor = createEditor({
      namespace: "link-roundtrip-test",
      nodes: [LinkNode, AutoLinkNode],
      onError: (error) => {
        throw error;
      },
    });
    // Attaching a root runs createDOM → LinkNode.sanitizeUrl, where a
    // missing url crashed the builder.
    editor.setRootElement(document.createElement("div"));
    return editor;
  }

  function linksIn(editor: ReturnType<typeof createEditor>) {
    return editor.getEditorState().read(() => {
      const found: { url: string; target: string | null }[] = [];
      const walk = (n: LexicalNode) => {
        if ($isLinkNode(n))
          found.push({ url: n.getURL(), target: n.getTarget() });
        if ($isElementNode(n)) n.getChildren().forEach(walk);
      };
      walk($getRoot());
      return found;
    });
  }

  it.each(["link", "autolink"] as const)(
    "loads a stored %s into the editor with its url and tab choice",
    (type) => {
      const editor = mountedEditor();
      const state = preprocessEditorState(
        doc(paragraph(storedLink(type, true))),
      )!;
      editor.setEditorState(editor.parseEditorState(state), {});

      expect(linksIn(editor)).toEqual([{ url: URL_, target: "_blank" }]);
    },
  );

  it("saves a link made in the editor in the stored Payload shape", () => {
    const editor = mountedEditor();
    editor.update(
      () => {
        const link = $createLinkNode(URL_, { target: "_blank" });
        link.append($createTextNode("cheatsheet"));
        $getRoot().append($createParagraphNode().append(link));
      },
      { discrete: true },
    );

    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
    ) as unknown as {
      root: { children: { children: Record<string, unknown>[] }[] };
    };
    const node = saved.root.children[0]!.children[0]!;

    expect(node).toMatchObject({
      type: "link",
      version: 3,
      fields: { url: URL_, newTab: true, linkType: "custom" },
    });
    expect(node).not.toHaveProperty("url");
    expect(node).not.toHaveProperty("target");
  });

  it("round-trips a stored link unchanged", () => {
    const stored = doc(paragraph(text("See the "), storedLink("link", false)));
    const editor = mountedEditor();
    editor.setEditorState(
      editor.parseEditorState(preprocessEditorState(stored)!),
      {},
    );

    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
    ) as unknown as {
      root: { children: { children: Record<string, unknown>[] }[] };
    };

    expect(saved.root.children[0]!.children[1]).toMatchObject({
      type: "link",
      version: 3,
      fields: { url: URL_, newTab: false, linkType: "custom" },
    });
  });
});
