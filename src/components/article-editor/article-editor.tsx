"use client";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useReducer,
} from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@/components/ui/section-label";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";

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
import {
  LinkNode,
  AutoLinkNode,
} from "@payloadcms/richtext-lexical/lexical/link";
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
import { $insertTopLevel } from "./insert-top-level";
import { renderLexicalDocument } from "@/lib/lexical-view";
import type {
  ArticleEditorProps,
  SaveState,
  SlashGroup,
  SlashCommand,
} from "./types";
import { editorReducer, slashMenuReducer } from "./reducers";
import {
  extractPlainText,
  hasCodeNode,
  getHeadingOutline,
  filterSlashCommands,
  generateSlug,
  preprocessEditorState,
  postprocessEditorState,
} from "./utils";
import { SlashCommandMenu } from "./slash-command-menu";
import { FloatingToolbar } from "./floating-toolbar";
import { BlockHandles } from "./block-handles";
import { PrePublishDialog } from "./pre-publish-dialog";
import { destinationBehaviour, type ArticleDestination } from "./destination";

const BLOG_DESTINATION: ArticleDestination = { kind: "blog" };

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

export function ArticleEditor({
  initialData,
  isTrustedAuthor,
  destination = BLOG_DESTINATION,
}: ArticleEditorProps) {
  const t = useTranslations("articleEditor");
  const tErrors = useTranslations("magazineEditor.errors");
  const router = useRouter();
  // Every difference between the blog and a magazine comes from here.
  const behaviour = useMemo(
    () => destinationBehaviour(destination),
    [destination],
  );
  const publishesDirectly = behaviour.showTrustedPublish && isTrustedAuthor;
  const submitLabel = publishesDirectly
    ? t("publish")
    : t(behaviour.submitLabelKey);

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

  const {
    title,
    type,
    tags,
    mediaUrl,
    editorState,
    saving,
    submitting,
    saveState,
    lastSavedAt,
    articleId,
  } = state;

  const [slash, slashDispatch] = useReducer(slashMenuReducer, {
    open: false,
    query: "",
    activeIndex: 0,
  });

  const [tagInput, setTagInput] = useState("");
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [editorRef, setEditorRef] = useState<LexicalEditor | null>(null);
  const [editorAnchor, setEditorAnchor] = useState<HTMLDivElement | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const autosaveTimer = useRef<NodeJS.Timeout | null>(null);
  const serializeTimer = useRef<NodeJS.Timeout | null>(null);
  const messageTimer = useRef<NodeJS.Timeout | null>(null);
  const initialized = useRef(false);
  const savingRef = useRef(false);
  const submittingRef = useRef(false);
  savingRef.current = saving;
  submittingRef.current = submitting;

  const createMutation = api.articles.create.useMutation();
  const updateMutation = api.articles.update.useMutation();
  const submitMutation = api.articles.submit.useMutation();

  const initialConfig = useMemo(
    () => ({
      namespace: "ArticleEditor",
      theme: {
        paragraph: "mb-2 leading-relaxed",
        heading: {
          h2: "mt-6 mb-3 text-2xl font-semibold tracking-tight",
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
          bold: "font-semibold",
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
      editorState: initialData?.content
        ? preprocessEditorState(initialData.content)
        : undefined,
      onError: (error: Error) => console.error("[ArticleEditor]", error),
    }),
    [initialData?.content],
  );

  const showMessage = useCallback(
    (text: string, msgType: "success" | "error") => {
      setMessage({ text, type: msgType });
      if (messageTimer.current) clearTimeout(messageTimer.current);
      messageTimer.current = setTimeout(() => setMessage(null), 3500);
    },
    [],
  );

  /** A failed call as the writer reads it; `fallback` when it says nothing. */
  const errorText = useCallback(
    (err: unknown, fallback: string) => {
      const key = behaviour.errorKey(err);
      if (key !== null) return tErrors(key);
      return err instanceof Error ? err.message : fallback;
    },
    [behaviour, tErrors],
  );

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

          const time = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
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
          ...behaviour.createExtras,
        });

        const createdId = Number(created.id);
        const createdSlug = (created as { slug?: string }).slug;
        const time = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        dispatch({
          type: "SAVE_SUCCESS",
          payload: { articleId: createdId, time },
        });
        if (showToast) showMessage(t("draftCreated"), "success");

        // Update URL so refresh loads the saved article instead of a blank editor.
        // Use replaceState (not router.replace) to avoid soft navigation remount.
        if (!initialData?.id && createdSlug) {
          const currentPath = window.location.pathname;
          const locale = currentPath.split("/")[1]; // e.g. "en" or "nl"
          window.history.replaceState(
            null,
            "",
            `/${locale}${behaviour.editPath(createdSlug)}`,
          );
        }

        return createdId;
      } catch (err) {
        dispatch({ type: "SAVE_ERROR" });
        if (showToast) showMessage(errorText(err, t("failedToSave")), "error");
        return null;
      } finally {
        dispatch({ type: "SAVE_END" });
      }
    },
    [
      articleId,
      behaviour,
      createMutation,
      editorState,
      errorText,
      initialData?.id,
      mediaUrl,
      showMessage,
      t,
      tags,
      title,
      type,
      updateMutation,
    ],
  );

  const saveDraftRef = useRef(saveDraftInternal);
  saveDraftRef.current = saveDraftInternal;

  // --- Derived data ---

  const plainText = useMemo(() => {
    if (!editorState) return "";
    const nodes =
      (editorState as { root?: { children?: unknown[] } }).root?.children ?? [];
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
    return (
      (editorState as { root?: { children?: unknown[] } } | null)?.root
        ?.children ?? []
    );
  }, [editorState]);

  const outline = useMemo(
    () => getHeadingOutline(contentNodes),
    [contentNodes],
  );

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
        introBeforeHeading = contentNodes
          .slice(0, firstHeadingIndex)
          .some((node) => {
            if (!node || typeof node !== "object") return false;
            const n = node as Record<string, unknown>;
            return (
              n.type === "paragraph" &&
              extractPlainText(n.children).trim().length > 0
            );
          });
      }
    }

    if (!introBeforeHeading) results.push(t("checkMissingIntro"));
    return results;
  }, [contentNodes, plainText, t, title]);

  const warningChecks = useMemo(() => {
    const results: string[] = [];
    const containsCode = hasCodeNode(contentNodes) || plainText.includes("```");
    if (type === "tutorial" && !containsCode)
      results.push(t("checkTutorialNoCode"));
    if (plainText.includes("[MERMAID]") && !/graph\s+[A-Z]{2}/.test(plainText))
      results.push(t("checkMermaidLikelyInvalid"));
    if (wordCount > 0 && wordCount < 120) results.push(t("checkTooShort"));
    return results;
  }, [contentNodes, plainText, t, type, wordCount]);

  // --- Handlers ---

  const handleSubmit = useCallback(async () => {
    if (blockingChecks.length > 0) return;

    dispatch({ type: "SUBMIT_START" });
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    try {
      const id = await saveDraftInternal(true);
      if (id === null) return;

      await submitMutation.mutateAsync({ id });
      setPublishDialogOpen(false);
      showMessage(
        publishesDirectly ? t("publishedSuccess") : t(behaviour.submittedKey),
        "success",
      );
      setTimeout(() => router.push(behaviour.afterSubmitHref), 1400);
    } catch (err) {
      showMessage(errorText(err, t("failedToSubmit")), "error");
    } finally {
      dispatch({ type: "SUBMIT_END" });
    }
  }, [
    behaviour,
    blockingChecks,
    errorText,
    publishesDirectly,
    router,
    saveDraftInternal,
    showMessage,
    submitMutation,
    t,
  ]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }

    if (
      !title.trim() ||
      !editorState ||
      submittingRef.current ||
      savingRef.current
    )
      return;
    dispatch({ type: "MARK_UNSAVED" });
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(() => {
      void saveDraftRef.current(false);
    }, 1200);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [editorState, mediaUrl, tags, title, type]);

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
      dispatch({
        type: "SET_EDITOR_STATE",
        payload: postprocessEditorState(edState.toJSON()),
      });
    }, 150);
  }, []);

  const insertParagraphText = useCallback(
    (editor: LexicalEditor, text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        $insertTopLevel(
          text.split("\n").map((line) => {
            const p = $createParagraphNode();
            if (line.length > 0) p.append($createTextNode(line));
            return p;
          }),
        );
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
          $insertTopLevel([$createCodeBlockNode("", "typescript")]);
        });
        slashDispatch({ type: "CLOSE" });
        return;
      }
      if (id === "image") {
        editorRef.update(() => {
          $insertTopLevel([$createImageNode("", "")]);
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
      {initialData?.reviewNote &&
        (initialData.reviewStatus === "changes_requested" ||
          (behaviour.keepReviewNoteWhileWriting &&
            initialData.reviewStatus == null)) && (
          <div className="border-border text-foreground mb-6 rounded border px-4 py-3">
            <SectionLabel bordered={false}>
              {t("changesRequested")}
            </SectionLabel>
            <p className="mt-1 text-sm whitespace-pre-wrap">
              {initialData.reviewNote}
            </p>
          </div>
        )}

      {/* Toast messages */}
      {message && (
        <div
          className={`mb-6 rounded border px-4 py-2 text-sm ${message.type === "success" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}
        >
          {message.text}
        </div>
      )}

      {/* Sticky top bar */}
      <div className="bg-background/95 border-border/50 sticky top-28 z-30 -mx-6 border-b px-6 py-2.5 backdrop-blur sm:-mx-12 sm:px-12 lg:top-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              role="status"
              aria-live="polite"
              className="border-border text-foreground bg-background inline-flex h-6 items-center rounded-full border px-2 font-mono"
            >
              {saveStateLabel}
            </span>
            <span className="text-muted-foreground">
              {t("wordsCount", { count: wordCount })}
            </span>
            <span className="text-muted-foreground">
              {t("readingMinutes", { count: readingMinutes })}
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              {t("slashHint")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={previewing}
              onClick={() => setPreviewing((on) => !on)}
              className="border-border hover:bg-accent rounded border px-3 py-1.5 font-mono text-xs tracking-wider transition-colors"
            >
              {previewing ? t("backToEditing") : t("preview")}
            </button>
            <button
              type="button"
              onClick={() => setPublishDialogOpen(true)}
              className="bg-foreground text-background hover:bg-foreground/90 rounded px-4 py-1.5 font-mono text-xs tracking-wider transition-colors"
            >
              {submitLabel.toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      {/* Borderless title */}
      {previewing ? (
        <h1 className="mt-8 text-3xl leading-tight font-semibold tracking-tight">
          {title.trim() || t("previewUntitled")}
        </h1>
      ) : (
        <input
          type="text"
          value={title}
          onChange={(e) =>
            dispatch({
              type: "SET_FIELD",
              field: "title",
              payload: e.target.value,
            })
          }
          placeholder={t("articleTitlePlaceholder")}
          className="placeholder:text-muted-foreground/40 mt-8 w-full bg-transparent text-3xl leading-tight font-semibold tracking-tight focus:outline-none"
        />
      )}

      {/* Subtle separator */}
      <div className="border-border my-4 border-b" />

      {/* Borderless content editor */}
      <div
        className="editor-anchor relative"
        ref={setEditorAnchor}
        hidden={previewing}
      >
        <LexicalComposer initialConfig={initialConfig}>
          <EditorBridge onReady={setEditorRef} />
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="min-h-[60vh] pl-14 text-sm leading-relaxed focus:outline-none"
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

      {previewing && (
        <article aria-label={t("previewLabel")} className="mt-4">
          {editorState ? (
            renderLexicalDocument(editorState)
          ) : (
            <p className="text-muted-foreground text-sm">{t("previewEmpty")}</p>
          )}
        </article>
      )}

      <PrePublishDialog
        open={publishDialogOpen}
        onClose={() => setPublishDialogOpen(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel={submitLabel}
        title={t(behaviour.prePublishTitleKey)}
        subtitle={t(behaviour.prePublishSubtitleKey)}
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
