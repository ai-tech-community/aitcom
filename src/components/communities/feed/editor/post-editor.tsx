"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { POST_MAX_LENGTH } from "@/lib/feed-post-rules";
import { cn } from "@/lib/utils";

import type { usePostText } from "./use-post-text";

/** The counter appears once this few characters are left. */
const COUNTER_FROM = 200;
/** Screen readers hear the limit at these points, not on every key. */
const ANNOUNCE_AT = [20, 100] as const;

function firstImage(files: FileList | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find((f) => f.type.startsWith("image/")) ?? null;
}

function draggingFiles(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes("Files");
}

/** What a screen reader is told about the length, by milestone. */
function lengthMilestone(left: number): "over" | 0 | 20 | 100 | null {
  if (left < 0) return "over";
  if (left === 0) return 0;
  return ANNOUNCE_AT.find((at) => left <= at) ?? null;
}

/**
 * The shared post editor, used by the new-post box and the edit form: one
 * bordered field holding the text, the attachments and a toolbar. The text
 * area itself is borderless; the field takes the focus ring while the text
 * area has focus.
 *
 * A picture can also be pasted or dropped in when `onImageFile` is given.
 * While it is not (a video is attached, an upload is running),
 * `imageRefusal` says why, and a dropped file never makes the browser
 * leave the page. Ctrl/Cmd+Enter calls `onSubmitShortcut`.
 *
 * The text may run past the limit: the counter then shows how much to cut,
 * and the form disables sending (`usePostText().tooLong`).
 */
export function PostEditor({
  text,
  label,
  placeholder,
  autoFocus,
  onImageFile,
  imageRefusal,
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
  /** Why a picture cannot be added right now, shown when one is dropped. */
  imageRefusal?: string;
  onSubmitShortcut?: () => void;
  /** Previews of what the post carries, and notes about them. */
  attachments?: ReactNode;
  /** Toolbar actions on the left: add picture, video, emoji. */
  tools?: ReactNode;
  /** On the right: the submit (and cancel) buttons. */
  actions?: ReactNode;
  /** A line under the field, e.g. "Your unsent text is back". */
  notice?: ReactNode;
}) {
  const t = useTranslations("communities.feed.editor");
  const [dragging, setDragging] = useState(false);
  const left = POST_MAX_LENGTH - text.value.length;
  const counterId = useId();
  const milestone = lengthMilestone(left);

  const takeImage = (file: File | null) => {
    if (!file) {
      toast.error(t("notAPicture"));
      return;
    }
    if (onImageFile) onImageFile(file);
    else if (imageRefusal) toast.error(imageRefusal);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-1.5">
        <div
          data-dragging={dragging || undefined}
          className={cn(
            "border-input bg-background relative rounded-lg border shadow-xs transition-[color,box-shadow]",
            "has-[textarea:focus]:border-ring has-[textarea:focus]:ring-ring/50 has-[textarea:focus]:ring-[3px]",
            "data-[dragging]:border-ring data-[dragging]:ring-ring/50 data-[dragging]:ring-[3px]",
          )}
          // Every file drag is ours, so the browser never opens a dropped
          // file in place of the page; a refused one gets a message.
          onDragEnter={(e) => {
            if (!draggingFiles(e)) return;
            e.preventDefault();
            if (onImageFile) setDragging(true);
          }}
          onDragOver={(e) => {
            if (!draggingFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = onImageFile ? "copy" : "none";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDragging(false);
            }
          }}
          onDrop={(e) => {
            if (!draggingFiles(e)) return;
            e.preventDefault();
            setDragging(false);
            takeImage(firstImage(e.dataTransfer.files));
          }}
        >
          <textarea
            ref={text.textareaRef}
            value={text.value}
            onChange={(e) => text.setValue(e.target.value)}
            onPaste={(e) => {
              const file = firstImage(e.clipboardData.files);
              // Office apps put a picture of the selection next to its
              // text: pasting text always wins.
              if (!file || e.clipboardData.getData("text/plain")) return;
              e.preventDefault();
              takeImage(file);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmitShortcut?.();
              }
            }}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={text.tooLong || undefined}
            aria-describedby={left <= COUNTER_FROM ? counterId : undefined}
            autoFocus={autoFocus}
            rows={3}
            className="placeholder:text-muted-foreground block field-sizing-content max-h-80 min-h-20 w-full resize-none bg-transparent px-3 pt-3 pb-2 text-base outline-none md:text-sm"
          />

          {attachments ? (
            <div className="space-y-3 px-3 pb-3">{attachments}</div>
          ) : null}

          <div className="border-border flex flex-wrap items-center gap-1 border-t px-1.5 py-1.5">
            <div className="flex flex-auto flex-wrap items-center gap-0.5">
              {tools}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {left <= COUNTER_FROM ? (
                <span
                  id={counterId}
                  className={cn(
                    "px-1.5 font-mono text-xs tabular-nums",
                    left < 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {left < 0
                    ? t("charactersOver", { count: -left })
                    : t("charactersLeft", { count: left })}
                </span>
              ) : null}
              {actions}
            </div>
          </div>

          {/* Always mounted; speaks only when a milestone is crossed. */}
          <p role="status" className="sr-only">
            {milestone === "over"
              ? t("limitOver")
              : milestone === 0
                ? t("limitReached")
                : milestone
                  ? t("limitSoon", { count: milestone })
                  : ""}
          </p>

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
