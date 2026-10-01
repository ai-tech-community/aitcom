"use client";

import { useState } from "react";
import { EmojiPicker } from "frimousse";
import { Smile } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { ToolbarButton } from "./toolbar-button";

/** Served by /api/emojibase, so the picker never calls an outside CDN. */
const EMOJIBASE_URL = "/api/emojibase";

/**
 * The editor's emoji button: a searchable, keyboard-navigable emoji panel
 * (frimousse) in the member's language. Picking an emoji inserts it and
 * closes the panel.
 */
export function EmojiPickerButton({
  onPick,
  disabled,
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolbarButton
          label={t("emoji")}
          icon={<Smile aria-hidden="true" className="size-4" />}
          disabled={disabled}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        aria-label={t("emoji")}
        // Focus goes to the search box, not the first emoji.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // After a pick the text field takes focus back (usePostText), not
        // this button.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <EmojiPicker.Root
          locale={locale === "nl" ? "nl" : "en"}
          emojibaseUrl={EMOJIBASE_URL}
          columns={8}
          onEmojiSelect={({ emoji }) => {
            onPick(emoji);
            setOpen(false);
          }}
          className="isolate flex h-[22rem] w-fit flex-col"
        >
          <EmojiPicker.Search
            autoFocus
            placeholder={t("emojiSearch")}
            aria-label={t("emojiSearch")}
            className="border-border bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 z-10 m-2 mb-1 h-8 appearance-none rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
          />
          <EmojiPicker.Viewport className="relative flex-1 outline-hidden">
            <EmojiPicker.Loading className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
              {t("emojiLoading")}
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
              {t("emojiNone")}
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="pb-1.5 select-none"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    className="bg-popover text-muted-foreground px-3 pt-3 pb-1.5 font-mono text-xs"
                    {...props}
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div className="scroll-my-1.5 px-1.5" {...props}>
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    className="data-[active]:bg-accent flex size-8 items-center justify-center rounded-md text-lg"
                    {...props}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </EmojiPicker.Viewport>
          <div className="border-border flex h-10 items-center justify-between gap-2 border-t px-2">
            <EmojiPicker.ActiveEmoji>
              {({ emoji }) =>
                emoji ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span aria-hidden="true" className="text-lg">
                      {emoji.emoji}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {emoji.label}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground truncate text-xs">
                    {t("emojiPickHint")}
                  </span>
                )
              }
            </EmojiPicker.ActiveEmoji>
            <EmojiPicker.SkinToneSelector
              aria-label={t("skinTone")}
              className="hover:bg-accent focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-md text-lg outline-none focus-visible:ring-[3px]"
            />
          </div>
        </EmojiPicker.Root>
      </PopoverContent>
    </Popover>
  );
}
