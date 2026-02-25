"use client";

import { useState, useCallback } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

// Lexical core
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type EditorState,
  type SerializedEditorState,
} from "@payloadcms/richtext-lexical/lexical";

// Lexical React
import { LexicalComposer } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposer";
import { RichTextPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@payloadcms/richtext-lexical/lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";

// Lexical nodes
import { HeadingNode, QuoteNode, $createHeadingNode } from "@payloadcms/richtext-lexical/lexical/rich-text";
import { ListNode, ListItemNode, INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from "@payloadcms/richtext-lexical/lexical/list";
import { LinkNode, AutoLinkNode } from "@payloadcms/richtext-lexical/lexical/link";
import { $setBlocksType } from "@payloadcms/richtext-lexical/lexical/selection";

// --- Types ---

interface ArticleEditorProps {
  initialData?: {
    id: number;
    title: string;
    slug: string;
    content: SerializedEditorState;
    type: "article" | "tutorial";
    tags: { tag: string }[];
    mediaUrl?: string;
    reviewStatus?: string;
    reviewNote?: string;
  };
  isTrustedAuthor: boolean;
}

// --- Toolbar ---

function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();

  const formatHeading = useCallback(
    (tag: "h2" | "h3") => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(tag));
        }
      });
    },
    [editor],
  );

  const formatParagraph = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => {
          return $createParagraphNode();
        });
      }
    });
  }, [editor]);

  const btn =
    "border-border hover:bg-secondary rounded border px-2 py-1 font-mono text-xs transition-colors";

  return (
    <div className="border-border flex flex-wrap gap-1 border-b p-2">
      <button type="button" className={btn} onClick={() => formatHeading("h2")}>
        H2
      </button>
      <button type="button" className={btn} onClick={() => formatHeading("h3")}>
        H3
      </button>
      <button type="button" className={btn} onClick={formatParagraph}>
        P
      </button>
      <span className="border-border mx-1 border-l" />
      <button
        type="button"
        className={btn}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        B
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        I
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
      >
        {"</>"}
      </button>
      <span className="border-border mx-1 border-l" />
      <button
        type="button"
        className={btn}
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
      >
        UL
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
      >
        OL
      </button>
      <span className="border-border mx-1 border-l" />
      <button
        type="button"
        className={btn}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        Undo
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        Redo
      </button>
    </div>
  );
}

// --- Slug generation ---

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// --- Main Component ---

export function ArticleEditor({ initialData, isTrustedAuthor }: ArticleEditorProps) {
  const router = useRouter();
  const isEditing = !!initialData;

  // Form state
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [type, setType] = useState<"article" | "tutorial">(initialData?.type ?? "article");
  const [tags, setTags] = useState<string[]>(initialData?.tags?.map((t) => t.tag) ?? []);
  const [tagInput, setTagInput] = useState("");
  const [mediaUrl, setMediaUrl] = useState(initialData?.mediaUrl ?? "");
  const [editorState, setEditorState] = useState<SerializedEditorState | null>(
    initialData?.content ?? null,
  );

  // UI state
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [articleId, setArticleId] = useState<number | null>(initialData?.id ?? null);

  // tRPC mutations
  const createMutation = api.articles.create.useMutation();
  const updateMutation = api.articles.update.useMutation();
  const submitMutation = api.articles.submit.useMutation();

  // Editor config
  const initialConfig = {
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
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
    editorState: initialData?.content ? JSON.stringify(initialData.content) : undefined,
    onError: (error: Error) => console.error("[ArticleEditor]", error),
  };

  const handleEditorChange = useCallback((state: EditorState) => {
    setEditorState(state.toJSON());
  }, []);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const showMessage = useCallback((text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  // Save draft
  const handleSaveDraft = useCallback(async () => {
    if (!title.trim() || !editorState) {
      showMessage("Title and content are required", "error");
      return;
    }

    setSaving(true);
    try {
      if (articleId) {
        await updateMutation.mutateAsync({
          id: articleId,
          title,
          content: editorState,
          type,
          tags: tags.map((t) => ({ tag: t })),
          mediaUrl: mediaUrl || null,
        });
        showMessage("Draft saved", "success");
      } else {
        const result = await createMutation.mutateAsync({
          title,
          slug: generateSlug(title),
          content: editorState,
          type,
          tags: tags.map((t) => ({ tag: t })),
          mediaUrl: mediaUrl || undefined,
        });
        setArticleId(result.id as number);
        showMessage("Draft created", "success");
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }, [title, editorState, type, tags, mediaUrl, articleId, updateMutation, createMutation, showMessage]);

  // Submit / publish
  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !editorState) {
      showMessage("Title and content are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      // Save first if new
      let id = articleId;
      if (!id) {
        const result = await createMutation.mutateAsync({
          title,
          slug: generateSlug(title),
          content: editorState,
          type,
          tags: tags.map((t) => ({ tag: t })),
          mediaUrl: mediaUrl || undefined,
        });
        id = result.id as number;
        setArticleId(id);
      } else {
        // Save latest changes
        await updateMutation.mutateAsync({
          id,
          title,
          content: editorState,
          type,
          tags: tags.map((t) => ({ tag: t })),
          mediaUrl: mediaUrl || null,
        });
      }

      await submitMutation.mutateAsync({ id });
      showMessage(
        isTrustedAuthor ? "Article published!" : "Article submitted for review",
        "success",
      );
      setTimeout(() => router.push("/blog/my-articles"), 1500);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Failed to submit", "error");
    } finally {
      setSubmitting(false);
    }
  }, [
    title,
    editorState,
    type,
    tags,
    mediaUrl,
    articleId,
    isTrustedAuthor,
    createMutation,
    updateMutation,
    submitMutation,
    showMessage,
    router,
  ]);

  const inputClass =
    "border-border bg-background w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-6">
      {/* Review note banner */}
      {initialData?.reviewStatus === "changes_requested" && initialData.reviewNote && (
        <div className="rounded border border-orange-500/30 bg-orange-500/10 px-4 py-3">
          <p className="font-mono text-xs font-medium tracking-wider text-orange-400">
            CHANGES REQUESTED
          </p>
          <p className="mt-1 text-sm">{initialData.reviewNote}</p>
        </div>
      )}

      {/* Message toast */}
      {message && (
        <div
          className={`rounded border px-4 py-2 text-sm ${
            message.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
          TITLE
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title..."
          className={inputClass}
        />
      </div>

      {/* Type + Featured Image row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
            TYPE
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "article" | "tutorial")}
            className={inputClass}
          >
            <option value="article">Article</option>
            <option value="tutorial">Tutorial</option>
          </select>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
            FEATURED IMAGE URL
          </label>
          <input
            type="text"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
          TAGS
        </label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="border-border text-muted-foreground flex items-center gap-1 rounded border border-dashed px-2 py-0.5 font-mono text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-foreground ml-0.5"
              >
                x
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add tag + Enter"
            className="border-border bg-background rounded border px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Lexical Editor */}
      <div>
        <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
          CONTENT
        </label>
        <div className="border-border overflow-hidden rounded border">
          <LexicalComposer initialConfig={initialConfig}>
            <ToolbarPlugin />
            <RichTextPlugin
              contentEditable={
                <ContentEditable className="min-h-[300px] px-4 py-3 text-sm leading-relaxed focus:outline-none" />
              }
              ErrorBoundary={({ children }) => <>{children}</>}
            />
            <HistoryPlugin />
            <ListPlugin />
            <OnChangePlugin onChange={handleEditorChange} />
          </LexicalComposer>
        </div>
      </div>

      {/* Actions */}
      <div className="border-border flex items-center gap-3 border-t pt-4">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className="border-border text-muted-foreground hover:text-foreground rounded border px-4 py-2 font-mono text-xs tracking-wider transition-colors disabled:opacity-50"
        >
          {saving ? "SAVING..." : "SAVE DRAFT"}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-foreground text-background hover:bg-foreground/90 rounded px-4 py-2 font-mono text-xs tracking-wider transition-colors disabled:opacity-50"
        >
          {submitting
            ? "SUBMITTING..."
            : isTrustedAuthor
              ? "PUBLISH"
              : "SUBMIT FOR REVIEW"}
        </button>
      </div>
    </div>
  );
}
