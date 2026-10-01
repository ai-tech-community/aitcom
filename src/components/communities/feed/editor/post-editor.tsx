"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ImageDown } from "lucide-react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { POST_MAX_LENGTH } from "@/lib/feed-post-rules";
import { cn } from "@/lib/utils";

import type { usePostText } from "./use-post-text";

/** The counter appears once this few characters are left. */
const COUNTER_FROM = 200;

function firstImage(files: FileList | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find((f) => f.type.startsWith("image/")) ?? null;
}

/**
 * The shared post editor, used by the new-post box and the edit form: one
 * bordered field holding the text, the attachments and a toolbar. The text
 * area itself is borderless; the whole field takes the focus ring.
 *
 * A picture can also be pasted or dropped in when `onImageFile` is given
 * (it is left out while a picture cannot be added, e.g. a video is
 * attached). Ctrl/Cmd+Enter calls `onSubmitShortcut`.
 */
export function PostEditor({
  text,
  label,
  placeholder,
  autoFocus,
  onImageFile,
  onSubmitShortcut,
  attachments,
  tools,
  actions,
  notice,
}: {
  text: ReturnType<typeof usePostText>;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onImageFile?: (file: File) => void;
  onSubmitShortcut?: () => void;
  /** Previews of what the post carries (picture, video). */
  attachments?: ReactNode;
  /** Toolbar actions on the left: add picture, video, emoji. */
  tools?: ReactNode;
  /** On the right: the submit (and cancel) buttons. */
  actions?: ReactNode;
  /** A line under the field, e.g. "Draft restored". */
  notice?: ReactNode;
}) {
  const t = useTranslations("communities.feed.editor");
  const [dragging, setDragging] = useState(false);
  const left = POST_MAX_LENGTH - text.value.length;
  const counterId = useId();

  const acceptsFiles = (e: React.DragEvent) =>
    Boolean(onImageFile) && e.dataTransfer.types.includes("Files");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-1.5">
        <div
          data-dragging={dragging || undefined}
          className={cn(
            "border-input bg-background relative rounded-lg border shadow-xs transition-[color,box-shadow]",
            "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
            "data-[dragging]:border-ring data-[dragging]:ring-ring/50 data-[dragging]:ring-[3px]",
          )}
          onDragEnter={(e) => {
            if (!acceptsFiles(e)) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            if (!acceptsFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDragging(false);
            }
          }}
          onDrop={(e) => {
            if (!acceptsFiles(e)) return;
            e.preventDefault();
            setDragging(false);
            const file = firstImage(e.dataTransfer.files);
            if (file) onImageFile?.(file);
          }}
        >
          <textarea
            ref={text.textareaRef}
            value={text.value}
            onChange={(e) => text.setValue(e.target.value)}
            onPaste={(e) => {
              if (!onImageFile) return;
              const file = firstImage(e.clipboardData.files);
              if (!file) return;
              e.preventDefault();
              onImageFile(file);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmitShortcut?.();
              }
            }}
            maxLength={POST_MAX_LENGTH}
            placeholder={placeholder}
            aria-label={label}
            aria-describedby={left <= COUNTER_FROM ? counterId : undefined}
            autoFocus={autoFocus}
            rows={3}
            className="placeholder:text-muted-foreground block field-sizing-content max-h-80 min-h-20 w-full resize-none bg-transparent px-3 pt-3 pb-2 text-base outline-none md:text-sm"
          />

          {attachments ? (
            <div className="space-y-3 px-3 pb-3">{attachments}</div>
          ) : null}

          <div className="border-border flex flex-wrap items-center gap-1 border-t px-1.5 py-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
              {tools}
            </div>
            {left <= COUNTER_FROM ? (
              <span
                id={counterId}
                className={cn(
                  "px-1.5 font-mono text-xs tabular-nums",
                  left <= 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {t("charactersLeft", { count: left })}
              </span>
            ) : null}
            <div className="flex items-center gap-1.5">{actions}</div>
          </div>

          {dragging ? (
            <div
              aria-hidden="true"
              className="bg-background/90 text-foreground pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg text-sm font-medium"
            >
              <ImageDown className="size-5" />
              {t("dropImage")}
            </div>
          ) : null}
        </div>
        {notice}
      </div>
    </TooltipProvider>
  );
}
