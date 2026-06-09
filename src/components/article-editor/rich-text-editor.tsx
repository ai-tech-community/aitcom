"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type LexicalEditor,
  type SerializedEditorState,
} from "@payloadcms/richtext-lexical/lexical";
import { LexicalComposer } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposer";
import { RichTextPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@payloadcms/richtext-lexical/lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@payloadcms/richtext-lexical/lexical/react/LexicalErrorBoundary";
import {
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@payloadcms/richtext-lexical/lexical/rich-text";
import {
  ListNode,
  ListItemNode,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  $isListNode,
} from "@payloadcms/richtext-lexical/lexical/list";
import {
  LinkNode,
  AutoLinkNode,
  TOGGLE_LINK_COMMAND,
} from "@payloadcms/richtext-lexical/lexical/link";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Link2,
  Image as ImageIcon,
  Minus,
} from "lucide-react";
import { $setBlocksType } from "@payloadcms/richtext-lexical/lexical/selection";
import {
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from "@payloadcms/richtext-lexical/lexical/react/LexicalHorizontalRuleNode";
import { HorizontalRulePlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalHorizontalRulePlugin";
import { CheckListPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalCheckListPlugin";
import { LinkPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalLinkPlugin";

import { CodeBlockNode, $createCodeBlockNode } from "./nodes/code-block-node";
import { ImageNode, $createImageNode } from "./nodes/image-node";
import type { SlashGroup, SlashCommand } from "./types";
import { slashMenuReducer } from "./reducers";
import {
  filterSlashCommands,
  preprocessEditorState,
  postprocessEditorState,
} from "./utils";
import { SlashCommandMenu } from "./slash-command-menu";
import { FloatingToolbar } from "./floating-toolbar";
import { BlockHandles } from "./block-handles";

/** Bridges the live LexicalEditor instance out of the composer context. */
function EditorBridge({
  onReady,
}: {
  onReady: (editor: LexicalEditor) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);

  return null;
}

/** Always-visible formatting toolbar — dispatches the same Lexical commands as
 *  the slash menu / floating toolbar, so the editor is usable without knowing
 *  the keyboard tricks. Block-level actions route through `onBlock` (the
 *  parent's slash-command executor); inline formatting + links dispatch
 *  directly on the editor instance (like the floating toolbar). */
function EditorToolbar({
  editor,
  onBlock,
}: {
  editor: LexicalEditor | null;
  onBlock: (id: string) => void;
}) {
  // Track which inline formats / block type are active under the caret so the
  // matching toolbar buttons can highlight.
  const [formats, setFormats] = useState<Set<string>>(new Set());
  const [block, setBlock] = useState<string>("");

  useEffect(() => {
    if (!editor) return;
    const read = () =>
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const f = new Set<string>();
        if (selection.hasFormat("bold")) f.add("bold");
        if (selection.hasFormat("italic")) f.add("italic");
        setFormats(f);

        const anchorNode = selection.anchor.getNode();
        const element =
          anchorNode.getKey() === "root"
            ? null
            : anchorNode.getTopLevelElement();
        let b = "";
        if (element) {
          if ($isHeadingNode(element))
            b = element.getTag(); // "h2" | "h3"
          else if ($isQuoteNode(element)) b = "quote";
          else if ($isListNode(element)) {
            const lt = element.getListType();
            b = lt === "number" ? "ol" : lt === "check" ? "check" : "ul";
          }
        }
        setBlock(b);
      });
    read();
    return editor.registerUpdateListener(() => read());
  }, [editor]);

  const isActive = (key: string) =>
    ((key === "bold" || key === "italic") && formats.has(key)) || key === block;

  const insertLink = () => {
    if (!editor) return;
    const url = window.prompt("Link URL");
    if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
  };

  const items: {
    key: string;
    title: string;
    icon: ReactNode;
    run: () => void;
  }[] = [
    {
      key: "bold",
      title: "Bold",
      icon: <Bold className="size-4" />,
      run: () => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"),
    },
    {
      key: "italic",
      title: "Italic",
      icon: <Italic className="size-4" />,
      run: () => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"),
    },
    {
      key: "h2",
      title: "Heading",
      icon: <Heading2 className="size-4" />,
      run: () => onBlock("h2"),
    },
    {
      key: "h3",
      title: "Subheading",
      icon: <Heading3 className="size-4" />,
      run: () => onBlock("h3"),
    },
    {
      key: "quote",
      title: "Quote",
      icon: <Quote className="size-4" />,
      run: () => onBlock("quote"),
    },
    {
      key: "ul",
      title: "Bullet list",
      icon: <List className="size-4" />,
      run: () => onBlock("ul"),
    },
    {
      key: "ol",
      title: "Numbered list",
      icon: <ListOrdered className="size-4" />,
      run: () => onBlock("ol"),
    },
    {
      key: "check",
      title: "Checklist",
      icon: <ListChecks className="size-4" />,
      run: () => onBlock("check"),
    },
    {
      key: "code",
      title: "Code block",
      icon: <Code className="size-4" />,
      run: () => onBlock("code"),
    },
    {
      key: "link",
      title: "Link",
      icon: <Link2 className="size-4" />,
      run: insertLink,
    },
    {
      key: "image",
      title: "Image",
      icon: <ImageIcon className="size-4" />,
      run: () => onBlock("image"),
    },
    {
      key: "divider",
      title: "Divider",
      icon: <Minus className="size-4" />,
      run: () => onBlock("divider"),
    },
  ];

  return (
    <div className="border-border flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          title={it.title}
          aria-label={it.title}
          disabled={!editor}
          aria-pressed={isActive(it.key)}
          className={`inline-flex size-8 items-center justify-center rounded transition-colors disabled:opacity-40 ${
            isActive(it.key)
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={it.run}
        >
          {it.icon}
        </button>
      ))}
    </div>
  );
}

export interface RichTextEditorProps {
  /** Lexical editorState JSON to seed the editor with, or null/undefined for empty. */
  initialValue?: unknown;
  /** Called (debounced) with the post-processed lexical editorState JSON on every change. */
  onChange: (state: unknown) => void;
  placeholder?: string;
}

/**
 * A standalone rich-text editing surface that reuses the blog article editor's
 * Lexical building blocks (floating toolbar, slash menu, block handles, custom
 * code/image nodes) without any article chrome (title/tags/cover/autosave).
 *
 * Consumers own the value: pass stored lexical JSON via `initialValue` and
 * receive the updated lexical JSON through `onChange`.
 */
export function RichTextEditor({
  initialValue,
  onChange,
  placeholder,
}: RichTextEditorProps) {
  const [slash, slashDispatch] = useReducer(slashMenuReducer, {
    open: false,
    query: "",
    activeIndex: 0,
  });

  const [editorRef, setEditorRef] = useState<LexicalEditor | null>(null);
  const [editorAnchor, setEditorAnchor] = useState<HTMLDivElement | null>(null);

  const serializeTimer = useRef<NodeJS.Timeout | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Seed the editor once from initialValue; subsequent changes are owned by the
  // editor itself (mirrors article-editor, which derives editorState from
  // initialData.content a single time).
  const initialConfig = useMemo(
    () => ({
      namespace: "RichTextEditor",
      theme: {
        paragraph: "mb-2 leading-relaxed",
        heading: {
          h2: "mt-6 mb-3 text-2xl font-bold tracking-tight",
          h3: "mt-4 mb-2 text-xl font-semibold",
        },
        list: {
          ul: "mb-4 pl-6 list-disc",
          ol: "mb-4 pl-6 list-decimal",
          listitem: "mb-1",
        },
        quote:
          "border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-4",
        text: {
          bold: "font-bold",
          italic: "italic",
          code: "bg-muted rounded px-1 py-0.5 font-mono text-sm",
          underline: "underline",
          strikethrough: "line-through",
        },
        link: "text-primary underline underline-offset-4 hover:opacity-80",
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        LinkNode,
        AutoLinkNode,
        HorizontalRuleNode,
        CodeBlockNode,
        ImageNode,
      ],
      editorState: initialValue
        ? preprocessEditorState(initialValue as SerializedEditorState)
        : undefined,
      onError: (error: Error) => console.error("[RichTextEditor]", error),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once; do not reseed on edits
    [],
  );

  const [isEmpty, setIsEmpty] = useState(() => {
    const children = (
      initialValue as { root?: { children?: unknown[] } } | null
    )?.root?.children;
    return !Array.isArray(children) || children.length === 0;
  });

  const handleEditorChange = useCallback((edState: EditorState) => {
    edState.read(() => {
      const root = edState.toJSON().root as { children?: unknown[] };
      const children = root?.children ?? [];
      const empty =
        children.length === 0 ||
        (children.length === 1 &&
          (children[0] as { children?: unknown[] })?.children?.length === 0);
      setIsEmpty(empty);
    });
    if (serializeTimer.current) clearTimeout(serializeTimer.current);
    serializeTimer.current = setTimeout(() => {
      onChangeRef.current(postprocessEditorState(edState.toJSON()));
    }, 150);
  }, []);

  const insertParagraphText = useCallback(
    (editor: LexicalEditor, text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const lines = text.split("\n");
        const nodes = lines.map((line) => {
          const p = $createParagraphNode();
          p.append($createTextNode(line));
          return p;
        });
        selection.insertNodes(nodes);
      });
    },
    [],
  );

  const executeSlashCommand = useCallback(
    (id: string) => {
      if (!editorRef) return;

      if (id === "h2" || id === "h3") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            $setBlocksType(selection, () => $createHeadingNode(id));
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }

      if (id === "paragraph") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            $setBlocksType(selection, () => $createParagraphNode());
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }

      if (id === "quote") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            $setBlocksType(selection, () => $createQuoteNode());
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }

      if (id === "ul")
        editorRef.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      if (id === "ol")
        editorRef.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      if (id === "check")
        editorRef.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      if (id === "divider") {
        editorRef.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
        slashDispatch({ type: "CLOSE" });
        return;
      }
      if (id === "code") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const codeBlock = $createCodeBlockNode("", "typescript");
            const trailingParagraph = $createParagraphNode();
            selection.insertNodes([codeBlock, trailingParagraph]);
          }
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }
      if (id === "image") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const imageNode = $createImageNode("", "");
            const trailingParagraph = $createParagraphNode();
            selection.insertNodes([imageNode, trailingParagraph]);
          }
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }
      if (id === "admonition-info")
        insertParagraphText(
          editorRef,
          "[!INFO] Short info title\nExplain the context and expected behavior.",
        );
      if (id === "admonition-warning")
        insertParagraphText(
          editorRef,
          "[!WARNING] Important warning\nDescribe risk, impact, and mitigation steps.",
        );
      if (id === "admonition-success")
        insertParagraphText(
          editorRef,
          "[!SUCCESS] Good practice\nExplain what success looks like and why it works.",
        );
      if (id === "mermaid")
        insertParagraphText(
          editorRef,
          "[MERMAID] graph TD; A[Start] --> B[End]",
        );
      if (id === "tabs") {
        insertParagraphText(
          editorRef,
          "[TABS]\n[Tab: API]\n```ts\nfetch('/api/example')\n```\n[Tab: cURL]\n```bash\ncurl https://example.com/api/example\n```",
        );
      }

      slashDispatch({ type: "CLOSE" });
    },
    [editorRef, insertParagraphText],
  );

  const filteredSlashCommands = useMemo(
    () => filterSlashCommands(slash.query),
    [slash.query],
  );

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!slash.open) {
        if (event.key === "/" && editorRef) {
          let shouldOpen = false;
          editorRef.getEditorState().read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const node = selection.anchor.getNode();
              const topElement = node.getTopLevelElement();
              if (topElement?.getTextContentSize() === 0) {
                shouldOpen = true;
              }
            }
          });
          if (shouldOpen) {
            event.preventDefault();
            slashDispatch({ type: "OPEN" });
          }
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        slashDispatch({ type: "CLOSE" });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        slashDispatch({
          type: "MOVE_DOWN",
          payload: filteredSlashCommands.length,
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        slashDispatch({
          type: "MOVE_UP",
          payload: filteredSlashCommands.length,
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const active = filteredSlashCommands[slash.activeIndex];
        if (active) executeSlashCommand(active.id);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        slashDispatch({ type: "BACKSPACE_QUERY" });
        return;
      }

      if (event.key.length === 1 && /[\w\- ]/.test(event.key)) {
        event.preventDefault();
        slashDispatch({ type: "APPEND_QUERY", payload: event.key });
      }
    },
    [
      editorRef,
      executeSlashCommand,
      filteredSlashCommands,
      slash.activeIndex,
      slash.open,
    ],
  );

  const groupedCommands = useMemo(() => {
    return filteredSlashCommands.reduce<Record<SlashGroup, SlashCommand[]>>(
      (acc, command) => {
        acc[command.group].push(command);
        return acc;
      },
      { Basic: [], Technical: [], Structure: [] },
    );
  }, [filteredSlashCommands]);

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <EditorToolbar editor={editorRef} onBlock={executeSlashCommand} />
      <div className="editor-anchor relative" ref={setEditorAnchor}>
        <LexicalComposer initialConfig={initialConfig}>
          <EditorBridge onReady={setEditorRef} />
          {placeholder && isEmpty ? (
            <div className="text-muted-foreground/40 pointer-events-none absolute top-3 left-4 text-sm sm:left-14">
              {placeholder}
            </div>
          ) : null}
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="min-h-48 px-4 py-3 text-sm leading-relaxed focus:outline-none sm:px-14"
                onKeyDown={handleEditorKeyDown}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <HorizontalRulePlugin />
          <CheckListPlugin />
          <LinkPlugin />
          <OnChangePlugin onChange={handleEditorChange} />
          <BlockHandles editor={editorRef} anchorElem={editorAnchor} />
        </LexicalComposer>

        <FloatingToolbar editor={editorRef} />

        <SlashCommandMenu
          slash={slash}
          slashDispatch={slashDispatch}
          filteredCommands={filteredSlashCommands}
          groupedCommands={groupedCommands}
          onExecute={executeSlashCommand}
        />
      </div>
    </div>
  );
}
