"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  type LexicalEditor,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
} from "@payloadcms/richtext-lexical/lexical/rich-text";
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  $isListNode,
} from "@payloadcms/richtext-lexical/lexical/list";
import { $setBlocksType } from "@payloadcms/richtext-lexical/lexical/selection";
import { TOGGLE_LINK_COMMAND } from "@payloadcms/richtext-lexical/lexical/link";

type TextFormat = "bold" | "italic" | "underline" | "strikethrough" | "code" | "subscript" | "superscript";
type AlignType = "left" | "center" | "right" | "justify";

type ActiveFormats = Record<TextFormat, boolean> & { link: boolean };

const INITIAL_FORMATS: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  code: false,
  subscript: false,
  superscript: false,
  link: false,
};

const BLOCK_TYPES = [
  { value: "paragraph", label: "Normal Text", icon: "T" },
  { value: "h1", label: "Heading 1", icon: "H1" },
  { value: "h2", label: "Heading 2", icon: "H2" },
  { value: "h3", label: "Heading 3", icon: "H3" },
  { value: "h4", label: "Heading 4", icon: "H4" },
  { value: "h5", label: "Heading 5", icon: "H5" },
  { value: "h6", label: "Heading 6", icon: "H6" },
  { value: "ol", label: "Ordered List", icon: "1." },
  { value: "ul", label: "Unordered List", icon: "•" },
  { value: "check", label: "Check List", icon: "☑" },
  { value: "quote", label: "Blockquote", icon: "❝" },
] as const;

const ALIGN_OPTIONS: { value: AlignType; label: string }[] = [
  { value: "left", label: "Align Left" },
  { value: "center", label: "Align Center" },
  { value: "right", label: "Align Right" },
  { value: "justify", label: "Align Justify" },
];

// Alignment icons
function AlignIcon({ align }: { align: AlignType }) {
  const lines: [number, number][] =
    align === "left"   ? [[2,5],[2,10],[2,5],[2,10]] :
    align === "center" ? [[4,5],[2,10],[4,5],[2,10]] :
    align === "right"  ? [[7,5],[2,10],[7,5],[2,10]] :
                         [[2,10],[2,10],[2,10],[2,10]];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {lines.map(([x, w], i) => (
        <line key={`${x}-${w}-${i}`} x1={x} y1={2 + i * 3.5} x2={x + w} y2={2 + i * 3.5} />
      ))}
    </svg>
  );
}

export function FloatingToolbar({ editor }: { editor: LexicalEditor | null }) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [formats, setFormats] = useState<ActiveFormats>(INITIAL_FORMATS);
  const [blockType, setBlockType] = useState("paragraph");
  const [currentAlign, setCurrentAlign] = useState<AlignType>("left");
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [blockDropdownOpen, setBlockDropdownOpen] = useState(false);
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const blockDropdownRef = useRef<HTMLDivElement>(null);
  const alignDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (blockDropdownRef.current && !blockDropdownRef.current.contains(e.target as Node)) {
        setBlockDropdownOpen(false);
      }
      if (alignDropdownRef.current && !alignDropdownRef.current.contains(e.target as Node)) {
        setAlignDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateToolbar = useCallback(() => {
    if (!editor) return;

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        setShow(false);
        setLinkMode(false);
        setBlockDropdownOpen(false);
        setAlignDropdownOpen(false);
        return;
      }

      const rs = selection;
      setFormats({
        bold: rs.hasFormat("bold"),
        italic: rs.hasFormat("italic"),
        underline: rs.hasFormat("underline"),
        strikethrough: rs.hasFormat("strikethrough"),
        code: rs.hasFormat("code"),
        subscript: rs.hasFormat("subscript"),
        superscript: rs.hasFormat("superscript"),
        link: false,
      });

      // Detect current block type and alignment
      const anchorNode = rs.anchor.getNode();
      const topElement = anchorNode.getTopLevelElement();
      if (topElement) {
        if ($isHeadingNode(topElement)) {
          setBlockType(topElement.getTag());
        } else if ($isListNode(topElement)) {
          setBlockType(topElement.getListType() === "number" ? "ol" : topElement.getListType() === "check" ? "check" : "ul");
        } else if (topElement.getType() === "quote") {
          setBlockType("quote");
        } else {
          setBlockType("paragraph");
        }
        // Read format as alignment
        const fmt = topElement.getFormatType();
        if (fmt === "center" || fmt === "right" || fmt === "justify") {
          setCurrentAlign(fmt);
        } else {
          setCurrentAlign("left");
        }
      }

      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setShow(false);
        return;
      }

      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) {
        setShow(false);
        return;
      }

      const editorRoot = editor.getRootElement();
      if (!editorRoot) return;
      const editorRect = editorRoot.getBoundingClientRect();

      setPos({
        top: rect.top - editorRect.top - 44,
        left: rect.left - editorRect.left + rect.width / 2,
      });
      setShow(true);
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  useEffect(() => {
    if (linkMode && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [linkMode]);

  const toggleFormat = useCallback(
    (format: TextFormat) => {
      if (!editor) return;
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [editor],
  );

  const setBlock = useCallback(
    (type: string) => {
      if (!editor) return;
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        if (type === "paragraph") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else if (type === "h1" || type === "h2" || type === "h3" || type === "h4" || type === "h5" || type === "h6") {
          $setBlocksType(selection, () => $createHeadingNode(type));
        } else if (type === "quote") {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });

      if (type === "ol") editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      if (type === "ul") editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      if (type === "check") editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);

      setBlockDropdownOpen(false);
    },
    [editor],
  );

  const setAlignment = useCallback(
    (align: AlignType) => {
      if (!editor) return;
      editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, align);
      setAlignDropdownOpen(false);
    },
    [editor],
  );

  const handleLink = useCallback(() => {
    if (formats.link) {
      editor?.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      setLinkMode(true);
      setLinkUrl("");
    }
  }, [editor, formats.link]);

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) {
      setLinkMode(false);
      return;
    }
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url, target: "_blank", rel: "noopener noreferrer" });
    setLinkMode(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  if (!show) return null;

  const btnClass = (active: boolean) =>
    `px-1.5 py-1 text-xs transition-colors rounded ${active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`;

  const sep = <div className="bg-border mx-0.5 h-4 w-px" />;

  const currentBlockLabel = BLOCK_TYPES.find((b) => b.value === blockType)?.icon ?? "T";

  return (
    <div
      ref={toolbarRef}
      className="bg-popover border-border absolute z-50 flex items-center gap-0.5 rounded-md border px-1 py-0.5 shadow-lg"
      style={{
        top: pos.top,
        left: pos.left,
        transform: "translateX(-50%)",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {linkMode ? (
        <div className="flex items-center gap-1 px-1">
          <input
            ref={linkInputRef}
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setLinkMode(false);
            }}
            placeholder="https://..."
            className="w-48 bg-transparent text-xs focus:outline-none"
          />
          <button type="button" onClick={applyLink} className={btnClass(false)}>
            ✓
          </button>
          <button type="button" onClick={() => setLinkMode(false)} className={btnClass(false)}>
            ✕
          </button>
        </div>
      ) : (
        <>
          {/* Block type dropdown */}
          <div className="relative" ref={blockDropdownRef}>
            <button
              type="button"
              onClick={() => { setBlockDropdownOpen(!blockDropdownOpen); setAlignDropdownOpen(false); }}
              className={`${btnClass(false)} flex items-center gap-0.5`}
            >
              <span className="font-mono text-[10px] font-semibold">{currentBlockLabel}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {blockDropdownOpen && (
              <div className="bg-popover border-border absolute left-0 top-full mt-1 min-w-40 rounded-md border py-1 shadow-lg">
                {BLOCK_TYPES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setBlock(item.value)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${blockType === item.value ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                  >
                    <span className="w-5 font-mono text-[10px] font-semibold">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Alignment dropdown */}
          <div className="relative" ref={alignDropdownRef}>
            <button
              type="button"
              onClick={() => { setAlignDropdownOpen(!alignDropdownOpen); setBlockDropdownOpen(false); }}
              className={`${btnClass(false)} flex items-center gap-0.5`}
            >
              <AlignIcon align={currentAlign} />
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {alignDropdownOpen && (
              <div className="bg-popover border-border absolute left-0 top-full mt-1 min-w-35 rounded-md border py-1 shadow-lg">
                {ALIGN_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setAlignment(item.value)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${currentAlign === item.value ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                  >
                    <AlignIcon align={item.value} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {sep}

          {/* Text formatting */}
          <button type="button" onClick={() => toggleFormat("bold")} className={btnClass(formats.bold)} title="Bold (Ctrl+B)">
            <span className="font-bold">B</span>
          </button>
          <button type="button" onClick={() => toggleFormat("italic")} className={btnClass(formats.italic)} title="Italic (Ctrl+I)">
            <span className="italic">I</span>
          </button>
          <button type="button" onClick={() => toggleFormat("underline")} className={btnClass(formats.underline)} title="Underline (Ctrl+U)">
            <span className="underline">U</span>
          </button>
          <button type="button" onClick={() => toggleFormat("strikethrough")} className={btnClass(formats.strikethrough)} title="Strikethrough">
            <span className="line-through">S</span>
          </button>

          {sep}

          {/* Subscript / Superscript */}
          <button type="button" onClick={() => toggleFormat("subscript")} className={btnClass(formats.subscript)} title="Subscript">
            <span className="text-[10px]">X<sub>2</sub></span>
          </button>
          <button type="button" onClick={() => toggleFormat("superscript")} className={btnClass(formats.superscript)} title="Superscript">
            <span className="text-[10px]">X<sup>2</sup></span>
          </button>

          {sep}

          {/* Code & Link */}
          <button type="button" onClick={() => toggleFormat("code")} className={btnClass(formats.code)} title="Inline Code">
            <span className="font-mono text-[10px]">&lt;/&gt;</span>
          </button>
          <button type="button" onClick={handleLink} className={btnClass(formats.link)} title="Link">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
