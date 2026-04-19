"use client";

import { useCallback, useRef } from "react";
import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  type LexicalEditor,
} from "@payloadcms/richtext-lexical/lexical";
import { DraggableBlockPlugin_EXPERIMENTAL } from "@payloadcms/richtext-lexical/lexical/react/LexicalDraggableBlockPlugin";

function BlockMenu({
  menuRef,
  onAdd,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  onAdd: () => void;
}) {
  return (
    <div
      ref={menuRef}
      className="absolute top-0 left-0 z-10 flex items-center gap-0.5 will-change-transform"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onAdd();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="text-muted-foreground/40 hover:bg-muted hover:text-foreground flex h-6 w-6 items-center justify-center rounded transition-colors"
        title="Add block below"
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <div
        className="text-muted-foreground/40 hover:bg-muted hover:text-foreground flex h-6 w-6 cursor-grab items-center justify-center rounded transition-colors active:cursor-grabbing"
        title="Drag to move"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </div>
    </div>
  );
}

function TargetLine({
  targetLineRef,
}: {
  targetLineRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={targetLineRef}
      className="bg-primary/40 pointer-events-none absolute top-0 left-0 h-1 rounded-full opacity-0 will-change-transform"
    />
  );
}

export function BlockHandles({
  editor,
  anchorElem,
}: {
  editor: LexicalEditor | null;
  anchorElem: HTMLElement | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);

  const handleAdd = useCallback(() => {
    const hoveredElement = hoveredElementRef.current;
    if (!editor || !hoveredElement) return;

    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(hoveredElement);
      if (!node) return;

      const topLevel = node.getTopLevelElement() ?? node;
      const paragraph = $createParagraphNode();
      topLevel.insertAfter(paragraph);
      paragraph.selectStart();
    });
  }, [editor]);

  const handleElementChanged = useCallback((element: HTMLElement | null) => {
    hoveredElementRef.current = element;
  }, []);

  const isOnMenu = useCallback((element: HTMLElement) => {
    return menuRef.current?.contains(element) ?? false;
  }, []);

  if (!editor || !anchorElem) return null;

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={<BlockMenu menuRef={menuRef} onAdd={handleAdd} />}
      targetLineComponent={<TargetLine targetLineRef={targetLineRef} />}
      isOnMenu={isOnMenu}
      onElementChanged={handleElementChanged}
    />
  );
}
