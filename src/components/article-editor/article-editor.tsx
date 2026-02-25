"use client";

import { useState, useCallback, useMemo, useEffect, useRef, useReducer } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  type EditorState,
  type LexicalEditor,
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
} from "@payloadcms/richtext-lexical/lexical/rich-text";
import {
  ListNode,
  ListItemNode,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from "@payloadcms/richtext-lexical/lexical/list";
import { LinkNode, AutoLinkNode } from "@payloadcms/richtext-lexical/lexical/link";
import { $setBlocksType } from "@payloadcms/richtext-lexical/lexical/selection";
import {
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from "@payloadcms/richtext-lexical/lexical/react/LexicalHorizontalRuleNode";
import { HorizontalRulePlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalHorizontalRulePlugin";

import { CodeBlockNode, $createCodeBlockNode } from "./nodes/code-block-node";
import { ImageNode, $createImageNode } from "./nodes/image-node";
import type { ArticleEditorProps, SaveState, SlashGroup, SlashCommand } from "./types";
import { editorReducer, slashMenuReducer } from "./reducers";
import { extractPlainText, hasCodeNode, getHeadingOutline, filterSlashCommands, generateSlug, preprocessEditorState, postprocessEditorState } from "./utils";
import { SlashCommandMenu } from "./slash-command-menu";
import { PrePublishDialog } from "./pre-publish-dialog";

function EditorBridge({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);

  return null;
}

export function ArticleEditor({ initialData, isTrustedAuthor }: ArticleEditorProps) {
  const t = useTranslations("articleEditor");
  const router = useRouter();

  const [state, dispatch] = useReducer(editorReducer, {
    title: initialData?.title ?? "",
    type: initialData?.type ?? "article",
    tags: initialData?.tags?.map((tagObj) => tagObj.tag) ?? [],
    mediaUrl: initialData?.mediaUrl ?? "",
    editorState: initialData?.content ?? null,
    saving: false,
    submitting: false,
    saveState: "idle" as SaveState,
    lastSavedAt: null,
    articleId: initialData?.id ?? null,
  });

  const { title, type, tags, mediaUrl, editorState, saving, submitting, saveState, lastSavedAt, articleId } = state;

  const [slash, slashDispatch] = useReducer(slashMenuReducer, {
    open: false,
    query: "",
    activeIndex: 0,
  });

  const [tagInput, setTagInput] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [editorRef, setEditorRef] = useState<LexicalEditor | null>(null);

  const autosaveTimer = useRef<NodeJS.Timeout | null>(null);
  const serializeTimer = useRef<NodeJS.Timeout | null>(null);
  const messageTimer = useRef<NodeJS.Timeout | null>(null);
  const initialized = useRef(false);

  const createMutation = api.articles.create.useMutation();
  const updateMutation = api.articles.update.useMutation();
  const submitMutation = api.articles.submit.useMutation();

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable: initial config must not change after mount
  const initialConfig = useMemo(() => ({
    namespace: "ArticleEditor",
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
      quote: "border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-4",
      text: {
        bold: "font-bold",
        italic: "italic",
        code: "bg-muted rounded px-1 py-0.5 font-mono text-sm",
        underline: "underline",
        strikethrough: "line-through",
      },
      link: "text-primary underline underline-offset-4 hover:opacity-80",
    },
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, HorizontalRuleNode, CodeBlockNode, ImageNode],
    editorState: initialData?.content ? preprocessEditorState(initialData.content) : undefined,
    onError: (error: Error) => console.error("[ArticleEditor]", error),
  }), []);

  const showMessage = useCallback((text: string, msgType: "success" | "error") => {
    setMessage({ text, type: msgType });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), 3500);
  }, []);

  const saveDraftInternal = useCallback(
    async (showToast: boolean) => {
      if (!title.trim() || !editorState) {
        if (showToast) showMessage(t("titleContentRequired"), "error");
        return null;
      }

      if (mediaUrl) {
        try {
          const parsed = new URL(mediaUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            if (showToast) showMessage(t("invalidMediaUrl"), "error");
            return null;
          }
        } catch {
          if (showToast) showMessage(t("invalidMediaUrl"), "error");
          return null;
        }
      }

      dispatch({ type: "SAVE_START" });

      try {
        if (articleId) {
          await updateMutation.mutateAsync({
            id: articleId,
            title,
            content: editorState,
            type,
            tags: tags.map((tag) => ({ tag })),
            mediaUrl: mediaUrl || null,
          });

          const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          dispatch({ type: "SAVE_SUCCESS", payload: { articleId, time } });
          if (showToast) showMessage(t("savedDraft"), "success");
          return articleId;
        }

        const created = await createMutation.mutateAsync({
          title,
          slug: generateSlug(title),
          content: editorState,
          type,
          tags: tags.map((tag) => ({ tag })),
          mediaUrl: mediaUrl || undefined,
        });

        const createdId = Number(created.id);
        const slug = generateSlug(title);
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        dispatch({ type: "SAVE_SUCCESS", payload: { articleId: createdId, time } });
        if (showToast) showMessage(t("draftCreated"), "success");

        // Update URL so refresh loads the saved article instead of a blank editor
        if (!initialData?.id) {
          const currentPath = window.location.pathname;
          const editPath = currentPath.replace(/\/blog\/write$/, `/blog/edit/${slug}`);
          window.history.replaceState(null, "", editPath);
        }

        return createdId;
      } catch (err) {
        dispatch({ type: "SAVE_ERROR" });
        if (showToast) {
          showMessage(err instanceof Error ? err.message : t("failedToSave"), "error");
        }
        return null;
      } finally {
        dispatch({ type: "SAVE_END" });
      }
    },
    [articleId, createMutation, editorState, mediaUrl, showMessage, t, tags, title, type, updateMutation],
  );

  const saveDraftRef = useRef(saveDraftInternal);
  saveDraftRef.current = saveDraftInternal;

  // --- Derived data ---

  const plainText = useMemo(() => {
    if (!editorState) return "";
    const nodes = (editorState as { root?: { children?: unknown[] } }).root?.children ?? [];
    return extractPlainText(nodes);
  }, [editorState]);

  const wordCount = useMemo(() => {
    if (!plainText.trim()) return 0;
    return plainText.trim().split(/\s+/).length;
  }, [plainText]);

  const readingMinutes = useMemo(() => {
    if (wordCount === 0) return 0;
    return Math.max(1, Math.ceil(wordCount / 220));
  }, [wordCount]);

  const contentNodes = useMemo(() => {
    return (editorState as { root?: { children?: unknown[] } } | null)?.root?.children ?? [];
  }, [editorState]);

  const outline = useMemo(() => getHeadingOutline(contentNodes), [contentNodes]);

  const blockingChecks = useMemo(() => {
    const results: string[] = [];
    if (!title.trim()) results.push(t("checkMissingTitle"));
    if (!plainText.trim()) results.push(t("checkMissingContent"));

    const hasH2 = Array.isArray(contentNodes)
      ? contentNodes.some((node) => {
          if (!node || typeof node !== "object") return false;
          const n = node as Record<string, unknown>;
          return n.type === "heading" && n.tag === "h2";
        })
      : false;
    if (!hasH2) results.push(t("checkMissingH2"));

    let introBeforeHeading = false;
    if (Array.isArray(contentNodes)) {
      const firstHeadingIndex = contentNodes.findIndex((node) => {
        if (!node || typeof node !== "object") return false;
        const n = node as Record<string, unknown>;
        return n.type === "heading";
      });

      if (firstHeadingIndex > 0) {
        introBeforeHeading = contentNodes.slice(0, firstHeadingIndex).some((node) => {
          if (!node || typeof node !== "object") return false;
          const n = node as Record<string, unknown>;
          return n.type === "paragraph" && extractPlainText(n.children).trim().length > 0;
        });
      }
    }

    if (!introBeforeHeading) results.push(t("checkMissingIntro"));
    return results;
  }, [contentNodes, plainText, t, title]);

  const warningChecks = useMemo(() => {
    const results: string[] = [];
    const containsCode = hasCodeNode(contentNodes) || plainText.includes("```");
    if (type === "tutorial" && !containsCode) results.push(t("checkTutorialNoCode"));
    if (plainText.includes("[MERMAID]") && !/graph\s+[A-Z]{2}/.test(plainText)) results.push(t("checkMermaidLikelyInvalid"));
    if (wordCount > 0 && wordCount < 120) results.push(t("checkTooShort"));
    return results;
  }, [contentNodes, plainText, t, type, wordCount]);

  // --- Handlers ---

  const handleSubmit = useCallback(async () => {
    if (blockingChecks.length > 0) return;

    dispatch({ type: "SUBMIT_START" });
    try {
      let id = articleId;
      if (!id) id = await saveDraftInternal(false);
      else await saveDraftInternal(false);

      if (!id) {
        showMessage(t("failedToSubmit"), "error");
        return;
      }

      await submitMutation.mutateAsync({ id });
      setPublishDialogOpen(false);
      showMessage(isTrustedAuthor ? t("publishedSuccess") : t("submitted"), "success");
      setTimeout(() => router.push("/blog/my-articles"), 1400);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : t("failedToSubmit"), "error");
    } finally {
      dispatch({ type: "SUBMIT_END" });
    }
  }, [articleId, blockingChecks, isTrustedAuthor, router, saveDraftInternal, showMessage, submitMutation, t]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }

    if (!title.trim() || !editorState || submitting || saving) return;
    dispatch({ type: "MARK_UNSAVED" });
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(() => {
      void saveDraftRef.current(false);
    }, 1200);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [editorState, mediaUrl, saving, submitting, tags, title, type]);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 10) {
      setTagInput("");
      return;
    }
    dispatch({ type: "ADD_TAG", payload: trimmed });
    setTagInput("");
  }, [tagInput, tags]);

  const handleEditorChange = useCallback((edState: EditorState) => {
    if (serializeTimer.current) clearTimeout(serializeTimer.current);
    serializeTimer.current = setTimeout(() => {
      dispatch({ type: "SET_EDITOR_STATE", payload: postprocessEditorState(edState.toJSON()) });
    }, 150);
  }, []);

  const insertParagraphText = useCallback((editor: LexicalEditor, text: string) => {
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
  }, []);

  const executeSlashCommand = useCallback(
    (id: string) => {
      if (!editorRef) return;

      if (id === "h2" || id === "h3") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode(id));
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }

      if (id === "paragraph") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode());
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }

      if (id === "quote") {
        editorRef.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode());
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }

      if (id === "ul") editorRef.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      if (id === "ol") editorRef.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      if (id === "check") editorRef.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
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
      if (id === "admonition-info") insertParagraphText(editorRef, "[!INFO] Short info title\nExplain the context and expected behavior.");
      if (id === "admonition-warning") insertParagraphText(editorRef, "[!WARNING] Important warning\nDescribe risk, impact, and mitigation steps.");
      if (id === "admonition-success") insertParagraphText(editorRef, "[!SUCCESS] Good practice\nExplain what success looks like and why it works.");
      if (id === "mermaid") insertParagraphText(editorRef, "[MERMAID] graph TD; A[Start] --> B[End]");
      if (id === "tabs") {
        insertParagraphText(editorRef, "[TABS]\n[Tab: API]\n```ts\nfetch('/api/example')\n```\n[Tab: cURL]\n```bash\ncurl https://example.com/api/example\n```");
      }

      slashDispatch({ type: "CLOSE" });
    },
    [editorRef, insertParagraphText],
  );

  const filteredSlashCommands = useMemo(() => filterSlashCommands(slash.query), [slash.query]);

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
        slashDispatch({ type: "MOVE_DOWN", payload: filteredSlashCommands.length });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        slashDispatch({ type: "MOVE_UP", payload: filteredSlashCommands.length });
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
    [editorRef, executeSlashCommand, filteredSlashCommands, slash.activeIndex, slash.open],
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

  const saveStateLabel =
    saveState === "saving"
      ? t("saveStateSaving")
      : saveState === "unsaved"
        ? t("saveStateUnsaved")
        : saveState === "saved"
          ? t("saveStateSavedAt", { time: lastSavedAt ?? "--:--" })
          : saveState === "error"
            ? t("saveStateError")
            : t("saveStateIdle");

  // --- Render ---

  return (
    <div>
      {/* Changes-requested banner */}
      {initialData?.reviewStatus === "changes_requested" && initialData.reviewNote && (
        <div className="mb-6 rounded border border-orange-500/30 bg-orange-500/10 px-4 py-3">
          <p className="font-mono text-xs font-medium tracking-wider text-orange-400">{t("changesRequested").toUpperCase()}</p>
          <p className="mt-1 text-sm">{initialData.reviewNote}</p>
        </div>
      )}

      {/* Toast messages */}
      {message && (
        <div className={`mb-6 rounded border px-4 py-2 text-sm ${message.type === "success" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
          {message.text}
        </div>
      )}

      {/* Sticky top bar */}
      <div className="bg-background/70 sticky top-14 z-10 -mx-6 border-b border-border/50 px-6 py-2.5 backdrop-blur sm:-mx-12 sm:px-12">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-mono">{saveStateLabel}</span>
            <span className="text-muted-foreground">{t("wordsCount", { count: wordCount })}</span>
            <span className="text-muted-foreground">{t("readingMinutes", { count: readingMinutes })}</span>
            <span className="text-muted-foreground hidden sm:inline">{t("slashHint")}</span>
          </div>
          <button
            type="button"
            onClick={() => setPublishDialogOpen(true)}
            className="bg-foreground text-background hover:bg-foreground/90 rounded px-4 py-1.5 font-mono text-xs tracking-wider transition-colors"
          >
            {isTrustedAuthor ? t("publish").toUpperCase() : t("submitForReview").toUpperCase()}
          </button>
        </div>
      </div>

      {/* Borderless title */}
      <input
        type="text"
        value={title}
        onChange={(e) => dispatch({ type: "SET_FIELD", field: "title", payload: e.target.value })}
        placeholder={t("articleTitlePlaceholder")}
        className="mt-8 w-full bg-transparent text-3xl font-bold leading-tight tracking-tight placeholder:text-muted-foreground/40 focus:outline-none"
      />

      {/* Subtle separator */}
      <div className="border-b border-border my-4" />

      {/* Borderless content editor */}
      <div className="relative">
        <LexicalComposer initialConfig={initialConfig}>
          <EditorBridge onReady={setEditorRef} />
          <RichTextPlugin
            contentEditable={<ContentEditable className="min-h-[60vh] text-sm leading-relaxed focus:outline-none" onKeyDown={handleEditorKeyDown} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <HorizontalRulePlugin />
          <OnChangePlugin onChange={handleEditorChange} />
        </LexicalComposer>

        <SlashCommandMenu
          slash={slash}
          slashDispatch={slashDispatch}
          filteredCommands={filteredSlashCommands}
          groupedCommands={groupedCommands}
          onExecute={executeSlashCommand}
        />
      </div>

      <PrePublishDialog
        open={publishDialogOpen}
        onClose={() => setPublishDialogOpen(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
        isTrustedAuthor={isTrustedAuthor}
        blockingChecks={blockingChecks}
        warningChecks={warningChecks}
        outline={outline}
        type={type}
        tags={tags}
        mediaUrl={mediaUrl}
        tagInput={tagInput}
        onTagInputChange={setTagInput}
        onAddTag={addTag}
        dispatch={dispatch}
      />
    </div>
  );
}
