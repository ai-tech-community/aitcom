import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";

export interface ArticleEditorProps {
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

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";
export type SlashGroup = "Basic" | "Technical" | "Structure";

export type SlashCommand = {
  id: string;
  label: string;
  group: SlashGroup;
  keywords: string[];
};

export type EditorFormState = {
  title: string;
  type: "article" | "tutorial";
  tags: string[];
  mediaUrl: string;
  editorState: SerializedEditorState | null;
  saving: boolean;
  submitting: boolean;
  saveState: SaveState;
  lastSavedAt: string | null;
  articleId: number | null;
};

export type EditorAction =
  | { type: "SET_FIELD"; field: "title" | "mediaUrl"; payload: string }
  | { type: "SET_ARTICLE_TYPE"; payload: "article" | "tutorial" }
  | { type: "ADD_TAG"; payload: string }
  | { type: "REMOVE_TAG"; payload: string }
  | { type: "SET_EDITOR_STATE"; payload: SerializedEditorState }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; payload: { articleId: number; time: string } }
  | { type: "SAVE_ERROR" }
  | { type: "SAVE_END" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_END" }
  | { type: "MARK_UNSAVED" };

export type SlashMenuState = {
  open: boolean;
  query: string;
  activeIndex: number;
};

export type SlashMenuAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "APPEND_QUERY"; payload: string }
  | { type: "BACKSPACE_QUERY" }
  | { type: "SET_ACTIVE_INDEX"; payload: number }
  | { type: "MOVE_DOWN"; payload: number }
  | { type: "MOVE_UP"; payload: number };

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "h2",
    label: "Heading 2",
    group: "Basic",
    keywords: ["heading", "title", "h2"],
  },
  {
    id: "h3",
    label: "Heading 3",
    group: "Basic",
    keywords: ["heading", "subtitle", "h3"],
  },
  {
    id: "paragraph",
    label: "Paragraph",
    group: "Basic",
    keywords: ["text", "p"],
  },
  {
    id: "quote",
    label: "Quote",
    group: "Basic",
    keywords: ["quote", "blockquote"],
  },
  {
    id: "ul",
    label: "Bulleted List",
    group: "Structure",
    keywords: ["list", "bullet", "ul"],
  },
  {
    id: "ol",
    label: "Numbered List",
    group: "Structure",
    keywords: ["list", "ordered", "ol"],
  },
  {
    id: "check",
    label: "Checklist",
    group: "Structure",
    keywords: ["todo", "tasks", "check"],
  },
  {
    id: "divider",
    label: "Divider",
    group: "Structure",
    keywords: ["hr", "separator", "divider"],
  },
  {
    id: "admonition-info",
    label: "Admonition: Info",
    group: "Technical",
    keywords: ["callout", "note", "info"],
  },
  {
    id: "admonition-warning",
    label: "Admonition: Warning",
    group: "Technical",
    keywords: ["warning", "warn", "risk"],
  },
  {
    id: "admonition-success",
    label: "Admonition: Success",
    group: "Technical",
    keywords: ["success", "tip", "good"],
  },
  {
    id: "mermaid",
    label: "Mermaid Diagram",
    group: "Technical",
    keywords: ["diagram", "flow", "mermaid"],
  },
  {
    id: "image",
    label: "Image",
    group: "Basic",
    keywords: ["image", "picture", "photo", "img"],
  },
  {
    id: "code",
    label: "Code Block",
    group: "Technical",
    keywords: ["code", "snippet", "pre", "block"],
  },
  {
    id: "tabs",
    label: "Tabs/Snippets Template",
    group: "Technical",
    keywords: ["tabs", "snippets", "code"],
  },
];
