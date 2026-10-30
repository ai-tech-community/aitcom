"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  $getNodeByKey,
} from "@payloadcms/richtext-lexical/lexical";

import { uploadSharedImage } from "@/lib/upload-shared-image";

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

export function ArticleImageBlock({
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      try {
        const url = await uploadSharedImage(file, currentAlt || "upload");
        setCurrentSrc(url);
        setImgError(false);
        updateNode(url, currentAlt);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [currentAlt, updateNode],
  );

  return (
    <div className="border-border my-4 rounded border">
      <div className="border-border flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <input
          type="text"
          value={currentSrc}
          onChange={(e) => {
            setCurrentSrc(e.target.value);
            setImgError(false);
            updateNode(e.target.value, currentAlt);
          }}
          placeholder="https://example.com/image.jpg"
          aria-label="Image URL"
          className="text-muted-foreground min-w-40 flex-1 bg-transparent font-mono text-xs focus:outline-none"
        />
        <input
          type="text"
          value={currentAlt}
          onChange={(e) => {
            setCurrentAlt(e.target.value);
            updateNode(currentSrc, e.target.value);
          }}
          placeholder="Alt text..."
          aria-label="Alt text"
          className="text-muted-foreground w-32 bg-transparent text-xs focus:outline-none"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => void handleUpload(e.target.files?.[0])}
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-foreground hover:bg-muted rounded border px-2 py-0.5 text-xs transition-colors disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
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
        <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
          {uploading
            ? "Uploading…"
            : currentSrc
              ? imgError
                ? "Image failed to load"
                : "Enter a valid https:// image URL"
              : "Upload an image or paste an https URL. Up to 2 MB."}
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
      <ArticleImageBlock
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

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
