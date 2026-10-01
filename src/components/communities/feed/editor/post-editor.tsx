"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { POST_MAX_LENGTH } from "@/lib/feed-post-rules";
import { toggleWrap } from "@/lib/post-format";
import { cn } from "@/lib/utils";

import type { MentionPicker } from "./mention-picker";
import type { usePostText } from "./use-post-text";

/** The counter appears once this few characters are left. */
const COUNTER_FROM = 200;
/** Screen readers hear the limit at these points, not on every key. */
const ANNOUNCE_AT = [20, 100] as const;

function imagesIn(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
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
 * Pictures can also be pasted or dropped in when `onImageFiles` is given.
 * While it is not (a video is attached, an upload is running),
 * `imageRefusal` says why, and a dropped file never makes the browser
 * leave the page. Ctrl/Cmd+Enter calls `onSubmitShortcut`. With a
 * `mentions` picker (`useMentionPicker`), typing "@" offers members.
 *
 * The text may run past the limit: the counter then shows how much to cut,
 * and the form disables sending (`usePostText().tooLong`).
 */
export function PostEditor({
  text,
  mentions,
  label,
  placeholder,
  autoFocus,
  onImageFiles,
  imageRefusal,
  onSubmitShortcut,
  attachments,
  tools,
  actions,
  notice,
}: {
  text: ReturnType<typeof usePostText>;
  /** Offers members to mention after "@" (`useMentionPicker`). */
  mentions?: MentionPicker;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onImageFiles?: (files: File[]) => void;
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

  const takeImages = (files: File[]) => {
    if (files.length === 0) {
      toast.error(t("notAPicture"));
      return;
    }
    if (onImageFiles) onImageFiles(files);
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
            if (onImageFiles) setDragging(true);
          }}
          onDragOver={(e) => {
            if (!draggingFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = onImageFiles ? "copy" : "none";
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
            takeImages(imagesIn(e.dataTransfer.files));
          }}
        >
          <textarea
            ref={text.textareaRef}
            value={text.value}
            onChange={(e) => {
              text.setValue(e.target.value);
              mentions?.update();
            }}
            onSelect={mentions?.update}
            onBlur={mentions?.onBlur}
            onPaste={(e) => {
              const files = imagesIn(e.clipboardData.files);
              // Office apps put a picture of the selection next to its
              // text: pasting text always wins.
              if (files.length === 0 || e.clipboardData.getData("text/plain")) {
                return;
              }
              e.preventDefault();
              takeImages(files);
            }}
            onKeyDown={(e) => {
              if (mentions?.onKeyDown(e)) return;
              if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmitShortcut?.();
                return;
              }
              // By key position, so Caps Lock and other keyboard layouts
              // work too.
              if (e.shiftKey) return;
              const marker =
                e.code === "KeyB" ? "**" : e.code === "KeyI" ? "_" : null;
              if (!marker) return;
              e.preventDefault();
              text.format((v, s, end) => toggleWrap(v, s, end, marker));
            }}
            placeholder={placeholder}
            aria-label={label}
            {...mentions?.fieldProps}
            aria-invalid={text.tooLong || undefined}
            aria-describedby={left <= COUNTER_FROM ? counterId : undefined}
            autoFocus={autoFocus}
            rows={3}
            className="placeholder:text-muted-foreground block field-sizing-content max-h-80 min-h-20 w-full resize-none bg-transparent px-3 pt-3 pb-2 text-base outline-none md:text-sm"
          />
          {mentions?.list}

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
