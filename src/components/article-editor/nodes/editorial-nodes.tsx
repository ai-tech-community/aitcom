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

type Photo = { src: string; alt: string; caption: string };

function blockId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function fieldClass() {
  return "text-muted-foreground min-w-0 flex-1 bg-transparent font-mono text-xs focus:outline-none";
}

function PhotoFields({
  photo,
  onChange,
  prefix,
}: {
  photo: Photo;
  onChange: (photo: Photo) => void;
  prefix: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="url"
        value={photo.src}
        aria-label={`${prefix} image URL`}
        placeholder="https://"
        className={fieldClass()}
        onChange={(event) => onChange({ ...photo, src: event.target.value })}
      />
      <input
        type="text"
        value={photo.alt}
        required
        aria-invalid={!photo.alt.trim()}
        aria-label={`${prefix} alt text`}
        placeholder="Alt text (required)"
        className={fieldClass()}
        onChange={(event) => onChange({ ...photo, alt: event.target.value })}
      />
      <input
        type="text"
        value={photo.caption}
        aria-label={`${prefix} caption`}
        placeholder="Caption"
        className={fieldClass()}
        onChange={(event) =>
          onChange({ ...photo, caption: event.target.value })
        }
      />
    </div>
  );
}

function shell(title: string, onRemove: () => void, children: React.ReactNode) {
  return (
    <div className="border-border my-4 rounded border">
      <div className="border-border flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-muted-foreground font-mono text-xs tracking-wider">
          {title}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive text-xs"
        >
          Remove
        </button>
      </div>
      <div className="flex flex-col gap-3 px-3 py-2">{children}</div>
    </div>
  );
}

type EditorialFields = {
  id: string;
  blockType: string;
  blockName: string;
  [key: string]: unknown;
};

type SerializedEditorial = SerializedLexicalNode & {
  type: string;
  fields: EditorialFields;
};

function useRemove(editor: LexicalEditor, nodeKey: NodeKey) {
  return useCallback(() => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });
  }, [editor, nodeKey]);
}

export class PullQuoteNode extends DecoratorNode<React.JSX.Element> {
  __quote: string;
  __attribution: string;
  __blockId: string;

  static getType(): string {
    return "pull-quote";
  }

  static clone(node: PullQuoteNode): PullQuoteNode {
    return new PullQuoteNode(
      node.__quote,
      node.__attribution,
      node.__blockId,
      node.__key,
    );
  }

  constructor(quote = "", attribution = "", blockId?: string, key?: NodeKey) {
    super(key);
    this.__quote = quote;
    this.__attribution = attribution;
    this.__blockId = blockId ?? blockIdFrom(blockId);
  }

  static importJSON(json: SerializedEditorial): PullQuoteNode {
    return new PullQuoteNode(
      textField(json, "quote"),
      textField(json, "attribution"),
      json.fields?.id,
    );
  }

  exportJSON(): SerializedEditorial {
    return {
      type: "pull-quote",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "PullQuote",
        blockName: "",
        quote: this.__quote,
        ...(this.__attribution ? { attribution: this.__attribution } : {}),
      },
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <PullQuoteEditor
        quote={this.__quote}
        attribution={this.__attribution}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

function blockIdFrom(id: string | undefined): string {
  return id && id.length > 0 ? id : blockId();
}

function textField(json: SerializedEditorial, name: string): string {
  const value = json.fields?.[name];
  return typeof value === "string" ? value : "";
}

function PullQuoteEditor({
  quote,
  attribution,
  nodeKey,
  editor,
}: {
  quote: string;
  attribution: string;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [currentQuote, setQuote] = useState(quote);
  const [currentAttribution, setAttribution] = useState(attribution);
  const remove = useRemove(editor, nodeKey);
  const write = (nextQuote: string, nextAttribution: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node instanceof PullQuoteNode) {
        const writable = node.getWritable();
        writable.__quote = nextQuote;
        writable.__attribution = nextAttribution;
      }
    });
  };
  return shell(
    "PULL QUOTE",
    remove,
    <>
      <textarea
        value={currentQuote}
        aria-label="Pull quote"
        rows={3}
        className="w-full bg-transparent text-sm focus:outline-none"
        onChange={(event) => {
          setQuote(event.target.value);
          write(event.target.value, currentAttribution);
        }}
      />
      <input
        type="text"
        value={currentAttribution}
        aria-label="Attribution"
        placeholder="Attribution"
        className={fieldClass()}
        onChange={(event) => {
          setAttribution(event.target.value);
          write(currentQuote, event.target.value);
        }}
      />
    </>,
  );
}

function photoFrom(value: unknown): Photo {
  if (!value || typeof value !== "object")
    return { src: "", alt: "", caption: "" };
  const row = value as { src?: unknown; alt?: unknown; caption?: unknown };
  return {
    src: typeof row.src === "string" ? row.src : "",
    alt: typeof row.alt === "string" ? row.alt : "",
    caption: typeof row.caption === "string" ? row.caption : "",
  };
}

export class CaptionedImageNode extends DecoratorNode<React.JSX.Element> {
  __photo: Photo;
  __blockId: string;

  static getType(): string {
    return "captioned-image";
  }

  static clone(node: CaptionedImageNode): CaptionedImageNode {
    return new CaptionedImageNode(node.__photo, node.__blockId, node.__key);
  }

  constructor(
    photo: Photo = { src: "", alt: "", caption: "" },
    blockId?: string,
    key?: NodeKey,
  ) {
    super(key);
    this.__photo = photo;
    this.__blockId = blockIdFrom(blockId);
  }

  static importJSON(json: SerializedEditorial): CaptionedImageNode {
    return new CaptionedImageNode(photoFrom(json.fields), json.fields?.id);
  }

  exportJSON(): SerializedEditorial {
    return {
      type: "captioned-image",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "CaptionedImage",
        blockName: "",
        src: this.__photo.src,
        alt: this.__photo.alt,
        ...(this.__photo.caption ? { caption: this.__photo.caption } : {}),
      },
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  setPhoto(photo: Photo): void {
    this.getWritable().__photo = photo;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <CaptionedImageEditor
        photo={this.__photo}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

function CaptionedImageEditor({
  photo,
  nodeKey,
  editor,
}: {
  photo: Photo;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [current, setCurrent] = useState(photo);
  const remove = useRemove(editor, nodeKey);
  return shell(
    "CAPTIONED IMAGE",
    remove,
    <PhotoFields
      photo={current}
      prefix="Photo"
      onChange={(next) => {
        setCurrent(next);
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (node instanceof CaptionedImageNode) node.setPhoto(next);
        });
      }}
    />,
  );
}

const EMPTY_PHOTO: Photo = { src: "", alt: "", caption: "" };

export class GalleryNode extends DecoratorNode<React.JSX.Element> {
  __photos: Photo[];
  __blockId: string;

  static getType(): string {
    return "gallery";
  }

  static clone(node: GalleryNode): GalleryNode {
    return new GalleryNode(node.__photos, node.__blockId, node.__key);
  }

  constructor(
    photos: Photo[] = [{ ...EMPTY_PHOTO }, { ...EMPTY_PHOTO }],
    blockId?: string,
    key?: NodeKey,
  ) {
    super(key);
    this.__photos = photos;
    this.__blockId = blockIdFrom(blockId);
  }

  static importJSON(json: SerializedEditorial): GalleryNode {
    const images = json.fields?.images;
    const photos = Array.isArray(images) ? images.map(photoFrom) : [];
    return new GalleryNode(
      photos.length > 0 ? photos : [{ ...EMPTY_PHOTO }, { ...EMPTY_PHOTO }],
      json.fields?.id,
    );
  }

  exportJSON(): SerializedEditorial {
    return {
      type: "gallery",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "Gallery",
        blockName: "",
        images: this.__photos.map((photo) => ({
          id: blockId(),
          src: photo.src,
          alt: photo.alt,
          ...(photo.caption ? { caption: photo.caption } : {}),
        })),
      },
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  setPhotos(photos: Photo[]): void {
    this.getWritable().__photos = photos;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <GalleryEditor
        photos={this.__photos}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

function GalleryEditor({
  photos,
  nodeKey,
  editor,
}: {
  photos: Photo[];
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [current, setCurrent] = useState(photos);
  const remove = useRemove(editor, nodeKey);
  const write = (next: Photo[]) => {
    setCurrent(next);
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node instanceof GalleryNode) node.setPhotos(next);
    });
  };
  return shell(
    "GALLERY",
    remove,
    <>
      {current.map((photo, index) => (
        <PhotoFields
          key={index}
          photo={photo}
          prefix={`Photo ${index + 1}`}
          onChange={(next) => {
            const copy = current.slice();
            copy[index] = next;
            write(copy);
          }}
        />
      ))}
      <button
        type="button"
        className="text-muted-foreground self-start text-xs"
        onClick={() => write([...current, { ...EMPTY_PHOTO }])}
      >
        Add photo
      </button>
    </>,
  );
}

export class SpreadNode extends DecoratorNode<React.JSX.Element> {
  __left: Photo;
  __right: Photo;
  __blockId: string;

  static getType(): string {
    return "spread";
  }

  static clone(node: SpreadNode): SpreadNode {
    return new SpreadNode(
      node.__left,
      node.__right,
      node.__blockId,
      node.__key,
    );
  }

  constructor(
    left: Photo = { ...EMPTY_PHOTO },
    right: Photo = { ...EMPTY_PHOTO },
    blockId?: string,
    key?: NodeKey,
  ) {
    super(key);
    this.__left = left;
    this.__right = right;
    this.__blockId = blockIdFrom(blockId);
  }

  static importJSON(json: SerializedEditorial): SpreadNode {
    return new SpreadNode(
      {
        src: textField(json, "leftSrc"),
        alt: textField(json, "leftAlt"),
        caption: textField(json, "leftCaption"),
      },
      {
        src: textField(json, "rightSrc"),
        alt: textField(json, "rightAlt"),
        caption: textField(json, "rightCaption"),
      },
      json.fields?.id,
    );
  }

  exportJSON(): SerializedEditorial {
    return {
      type: "spread",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "Spread",
        blockName: "",
        leftSrc: this.__left.src,
        leftAlt: this.__left.alt,
        ...(this.__left.caption ? { leftCaption: this.__left.caption } : {}),
        rightSrc: this.__right.src,
        rightAlt: this.__right.alt,
        ...(this.__right.caption ? { rightCaption: this.__right.caption } : {}),
      },
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  setSides(left: Photo, right: Photo): void {
    const writable = this.getWritable();
    writable.__left = left;
    writable.__right = right;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <SpreadEditor
        left={this.__left}
        right={this.__right}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

function SpreadEditor({
  left,
  right,
  nodeKey,
  editor,
}: {
  left: Photo;
  right: Photo;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [sides, setSides] = useState({ left, right });
  const remove = useRemove(editor, nodeKey);
  const write = (next: { left: Photo; right: Photo }) => {
    setSides(next);
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node instanceof SpreadNode) node.setSides(next.left, next.right);
    });
  };
  return shell(
    "SPREAD",
    remove,
    <>
      <PhotoFields
        photo={sides.left}
        prefix="Left"
        onChange={(photo) => write({ ...sides, left: photo })}
      />
      <PhotoFields
        photo={sides.right}
        prefix="Right"
        onChange={(photo) => write({ ...sides, right: photo })}
      />
    </>,
  );
}

const EDITORIAL_SLASH = new Set([
  "pull-quote",
  "captioned-image",
  "gallery",
  "spread",
]);

export function isEditorialSlash(id: string): boolean {
  return EDITORIAL_SLASH.has(id);
}

export function $createEditorialBlock(id: string): LexicalNode | null {
  switch (id) {
    case "pull-quote":
      return new PullQuoteNode();
    case "captioned-image":
      return new CaptionedImageNode();
    case "gallery":
      return new GalleryNode();
    case "spread":
      return new SpreadNode();
    default:
      return null;
  }
}
