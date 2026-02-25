"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  $getNodeByKey,
} from "@payloadcms/richtext-lexical/lexical";

export type SerializedImageNode = SerializedLexicalNode & {
  type: "image";
  src: string;
  alt: string;
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
  const [currentAlt, setCurrentAlt] = useState(alt);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setCurrentAlt(alt);
    setImgError(false);
  }, [src, alt]);

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

  return (
    <div className="border-border my-4 rounded border">
      <div className="flex gap-2 border-b border-border px-3 py-1.5">
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

export class ImageNode extends DecoratorNode<React.JSX.Element> {
  __src: string;
  __alt: string;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__alt, node.__key);
  }

  constructor(src: string, alt: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
  }

  static importJSON(json: SerializedImageNode): ImageNode {
    return new ImageNode(json.src ?? "", json.alt ?? "");
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      src: this.__src,
      alt: this.__alt,
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
