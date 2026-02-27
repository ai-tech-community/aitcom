"use client";

import { Bold, Code, Italic, Link2, List, ListOrdered } from "lucide-react";

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onUpdate: (value: string) => void;
};

function insertMarkdown(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  onUpdate: (value: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);
  const replacement = `${before}${selected || "text"}${after}`;
  const newText = text.substring(0, start) + replacement + text.substring(end);
  onUpdate(newText);
  // Set cursor position after React re-renders
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(
      start + before.length,
      start + before.length + (selected || "text").length,
    );
  }, 0);
}

const buttons = [
  { icon: Bold, before: "**", after: "**", title: "Bold" },
  { icon: Italic, before: "_", after: "_", title: "Italic" },
  { icon: Code, before: "`", after: "`", title: "Code" },
  { icon: Link2, before: "[", after: "](url)", title: "Link" },
  { icon: List, before: "- ", after: "", title: "Bullet list" },
  { icon: ListOrdered, before: "1. ", after: "", title: "Numbered list" },
];

export function MarkdownToolbar({ textareaRef, onUpdate }: Props) {
  return (
    <div className="flex gap-0.5 rounded-t-md border border-b-0 border-zinc-200 bg-zinc-50 px-1 py-1">
      {buttons.map((btn) => (
        <button
          key={btn.title}
          type="button"
          title={btn.title}
          onClick={() => {
            if (textareaRef.current) {
              insertMarkdown(
                textareaRef.current,
                btn.before,
                btn.after,
                onUpdate,
              );
            }
          }}
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
        >
          <btn.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
