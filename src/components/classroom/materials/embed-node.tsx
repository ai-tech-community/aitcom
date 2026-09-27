"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Presentation } from "lucide-react";
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "@payloadcms/richtext-lexical/lexical";

import type { RichTextEditorExtension } from "@/components/article-editor/rich-text-editor";
import {
  EMBED_PROVIDER_LABELS,
  resolveEmbed,
} from "@/lib/classroom/embed-providers";
import { EmbedFrame } from "./embed-frame";

/**
 * The editor's form of a stored Embed block. Apart from `type` (which the
 * editor remaps to "block" on save) it is exactly the stored `EmbedBlockNode`
 * shape from `@/lib/classroom/lesson-body`.
 */
export type SerializedEmbedNode = SerializedLexicalNode & {
  type: "embed";
  version: 2;
  format: "";
  fields: { id: string; blockName: ""; blockType: "Embed"; url: string };
};

function EmbedEditor({
  url,
  nodeKey,
  editor,
}: {
  url: string;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const t = useTranslations("classroom");
  const [value, setValue] = useState(url);
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setValue(url);
  }

  const update = useCallback(
    (next: string) => {
      setValue(next);
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof EmbedNode) node.setUrl(next.trim());
      });
    },
    [editor, nodeKey],
  );

  const remove = useCallback(() => {
    editor.update(() => $getNodeByKey(nodeKey)?.remove());
  }, [editor, nodeKey]);

  const resolved = value.trim() ? resolveEmbed(value) : null;

  return (
    <div className="border-border my-4 rounded-lg border">
      <div className="border-border flex items-center gap-2 border-b px-3 py-1.5">
        <input
          type="url"
          value={value}
          onChange={(e) => update(e.target.value)}
          placeholder={t("embedPlaceholder")}
          aria-label={t("embedLinkLabel")}
          className="text-muted-foreground flex-1 bg-transparent font-mono text-xs focus:outline-none"
        />
        {resolved ? (
          <span className="text-muted-foreground text-xs">
            {resolved.label}
          </span>
        ) : null}
        <button
          type="button"
          onClick={remove}
          className="text-muted-foreground hover:text-destructive text-xs transition-colors"
          aria-label={t("embedRemove")}
          title={t("embedRemove")}
        >
          ✕
        </button>
      </div>
      <div className="px-3 pb-3">
        {!value.trim() ? (
          <p className="text-muted-foreground pt-3 text-xs">
            {t("embedHelp", { providers: EMBED_PROVIDER_LABELS.join(", ") })}
          </p>
        ) : !resolved ? (
          <p className="text-destructive pt-3 text-xs">
            {t("embedUnsupported")}
          </p>
        ) : (
          <>
            {resolved.needsPublicSharing ? (
              <p className="text-muted-foreground pt-3 text-xs">
                {t("embedSharingHint")}
              </p>
            ) : null}
            <EmbedFrame url={value} />
          </>
        )}
      </div>
    </div>
  );
}

function generateBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

export class EmbedNode extends DecoratorNode<React.JSX.Element> {
  __url: string;
  __blockId: string;

  static getType(): string {
    return "embed";
  }

  static clone(node: EmbedNode): EmbedNode {
    return new EmbedNode(node.__url, node.__blockId, node.__key);
  }

  constructor(url: string, blockId?: string, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedEmbedNode): EmbedNode {
    return new EmbedNode(json.fields?.url ?? "", json.fields?.id);
  }

  exportJSON(): SerializedEmbedNode {
    return {
      type: "embed",
      version: 2,
      format: "",
      fields: {
        id: this.__blockId,
        blockName: "",
        blockType: "Embed",
        url: this.__url,
      },
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  setUrl(url: string): void {
    this.getWritable().__url = url;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <EmbedEditor url={this.__url} nodeKey={this.__key} editor={editor} />
    );
  }
}

export function $createEmbedNode(url = ""): EmbedNode {
  return new EmbedNode(url);
}

export function $isEmbedNode(
  node: LexicalNode | null | undefined,
): node is EmbedNode {
  return node instanceof EmbedNode;
}

/** The classroom's lesson-editor extensions. Module-level: stable identity. */
export const classroomEditorExtensions: readonly RichTextEditorExtension[] = [
  {
    node: EmbedNode,
    nodeType: "embed",
    blockType: "Embed",
    command: {
      id: "embed",
      label: "Embed slides or video",
      group: "Basic",
      keywords: [
        "embed",
        "video",
        "youtube",
        "vimeo",
        "loom",
        "slides",
        "google",
        "docs",
        "sheets",
        "drive",
        "figma",
      ],
    },
    toolbar: {
      title: "Embed slides or video",
      icon: <Presentation className="size-4" />,
    },
    create: () => $createEmbedNode(""),
  },
];
