"use client";

import { useCallback, useState } from "react";
import {
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  $getNodeByKey,
} from "@payloadcms/richtext-lexical/lexical";

export type SerializedImageNode = SerializedLexicalNode & {
  type: "image";
  fields: {
    id: string;
    blockType: "Image";
    src: string;
    alt: string;
    blockName: string;
  };
};

type LegacySerializedImageNode = SerializedImageNode & {
  src?: string;
  alt?: string;
};

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function ImageComponent({
  src,
  alt,
  nodeKey,
  editor,
}: {
  src: string;
  alt: string;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [prevSrc, setPrevSrc] = useState(src);
  const [currentAlt, setCurrentAlt] = useState(alt);
  const [prevAlt, setPrevAlt] = useState(alt);
  const [imgError, setImgError] = useState(false);

  // Sync with external prop changes (e.g., undo/redo) — update during render instead of useEffect
  if (src !== prevSrc) {
    setPrevSrc(src);
    setCurrentSrc(src);
    setImgError(false);
  }
  if (alt !== prevAlt) {
    setPrevAlt(alt);
    setCurrentAlt(alt);
  }

  const updateNode = useCallback(
    (newSrc: string, newAlt: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof ImageNode) {
          node.setSrc(newSrc);
          node.setAlt(newAlt);
        }
      });
    },
    [editor, nodeKey],
  );

  const handleDelete = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) node.remove();
    });
  }, [editor, nodeKey]);

  return (
    <div className="border-border my-4 rounded border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <input
          type="text"
          value={currentSrc}
          onChange={(e) => {
            setCurrentSrc(e.target.value);
            setImgError(false);
            updateNode(e.target.value, currentAlt);
          }}
          placeholder="https://example.com/image.jpg"
          className="flex-1 bg-transparent font-mono text-xs text-muted-foreground focus:outline-none"
        />
        <input
          type="text"
          value={currentAlt}
          onChange={(e) => {
            setCurrentAlt(e.target.value);
            updateNode(currentSrc, e.target.value);
          }}
          placeholder="Alt text..."
          className="w-32 bg-transparent text-xs text-muted-foreground focus:outline-none"
        />
        <button
          type="button"
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive text-xs transition-colors"
          title="Remove image"
        >
          ✕
        </button>
      </div>
      {currentSrc && !imgError && isValidImageUrl(currentSrc) ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs, next/image requires configured remotePatterns
        <img
          src={currentSrc}
          alt={currentAlt}
          className="w-full"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-32 items-center justify-center text-muted-foreground text-xs">
          {currentSrc ? (imgError ? "Image failed to load" : "Enter a valid https:// image URL") : "Enter an image URL above"}
        </div>
      )}
    </div>
  );
}

function generateBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

export class ImageNode extends DecoratorNode<React.JSX.Element> {
  __src: string;
  __alt: string;
  __blockId: string;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__alt, node.__blockId, node.__key);
  }

  constructor(src: string, alt: string, blockId?: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedImageNode): ImageNode {
    // Handle both new format (fields wrapper) and old format (top-level src/alt)
    const raw = json as LegacySerializedImageNode;
    return new ImageNode(
      json.fields?.src ?? raw.src ?? "",
      json.fields?.alt ?? raw.alt ?? "",
      json.fields?.id,
    );
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "Image",
        src: this.__src,
        alt: this.__alt,
        blockName: "",
      },
    };
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div");
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  setSrc(src: string): void {
    const self = this.getWritable();
    self.__src = src;
  }

  setAlt(alt: string): void {
    const self = this.getWritable();
    self.__alt = alt;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <ImageComponent
        src={this.__src}
        alt={this.__alt}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

export function $createImageNode(src = "", alt = ""): ImageNode {
  return new ImageNode(src, alt);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
