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

import { VideoFrame } from "./video-frame";

export type SerializedVideoNode = SerializedLexicalNode & {
  type: "video";
  fields: {
    id: string;
    blockType: "Video";
    url: string;
    blockName: string;
  };
};

function generateBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

function VideoEditor({
  url,
  nodeKey,
  editor,
}: {
  url: string;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [current, setCurrent] = useState(url);
  const [prev, setPrev] = useState(url);
  if (url !== prev) {
    setPrev(url);
    setCurrent(url);
  }

  const update = useCallback(
    (next: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof VideoNode) node.setUrl(next);
      });
    },
    [editor, nodeKey],
  );

  const remove = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) node.remove();
    });
  }, [editor, nodeKey]);

  return (
    <div className="border-border my-4 rounded border">
      <div className="border-border flex items-center gap-2 border-b px-3 py-1.5">
        <input
          type="text"
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
            update(event.target.value);
          }}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="Video URL"
          className="text-muted-foreground min-w-40 flex-1 bg-transparent font-mono text-xs focus:outline-none"
        />
        <button
          type="button"
          onClick={remove}
          className="text-muted-foreground hover:text-destructive text-xs transition-colors"
          title="Remove video"
        >
          ✕
        </button>
      </div>
      {current.trim() ? (
        <VideoFrame url={current} />
      ) : (
        <div className="text-muted-foreground flex h-24 items-center justify-center px-3 text-center text-xs">
          Paste a YouTube, Vimeo, or page URL.
        </div>
      )}
    </div>
  );
}

export class VideoNode extends DecoratorNode<React.JSX.Element> {
  __url: string;
  __blockId: string;

  static getType(): string {
    return "video";
  }

  static clone(node: VideoNode): VideoNode {
    return new VideoNode(node.__url, node.__blockId, node.__key);
  }

  constructor(url: string, blockId?: string, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedVideoNode): VideoNode {
    return new VideoNode(json.fields?.url ?? "", json.fields?.id);
  }

  exportJSON(): SerializedVideoNode {
    return {
      type: "video",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "Video",
        url: this.__url,
        blockName: "",
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
    const self = this.getWritable();
    self.__url = url;
  }

  getUrl(): string {
    return this.__url;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <VideoEditor url={this.__url} nodeKey={this.__key} editor={editor} />
    );
  }
}

export function $createVideoNode(url = ""): VideoNode {
  return new VideoNode(url);
}

export function $isVideoNode(
  node: LexicalNode | null | undefined,
): node is VideoNode {
  return node instanceof VideoNode;
}
