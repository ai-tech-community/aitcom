"use client";

import { useTranslations } from "next-intl";
import { Bold, Italic, List, ListOrdered } from "lucide-react";

import { toggleList, toggleWrap } from "@/lib/post-format";

import { ToolbarButton, ToolbarSeparator } from "./toolbar-button";
import type { usePostText } from "./use-post-text";

/**
 * Bold, italic and list buttons for the post editor. They write the light
 * formatting into the text (**bold**, _italic_, "- " and "1. "), so the
 * post reads the same anywhere; Ctrl/Cmd+B and +I do the same.
 */
export function FormatButtons({
  text,
  disabled,
}: {
  text: ReturnType<typeof usePostText>;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  return (
    <>
      <ToolbarSeparator />
      <ToolbarButton
        label={t("bold")}
        icon={<Bold aria-hidden="true" className="size-4" />}
        aria-keyshortcuts="Control+B Meta+B"
        shortcut="Ctrl+B"
        disabled={disabled}
        onClick={() => text.format((v, s, e) => toggleWrap(v, s, e, "**"))}
      />
      <ToolbarButton
        label={t("italic")}
        icon={<Italic aria-hidden="true" className="size-4" />}
        aria-keyshortcuts="Control+I Meta+I"
        shortcut="Ctrl+I"
        disabled={disabled}
        onClick={() => text.format((v, s, e) => toggleWrap(v, s, e, "_"))}
      />
      <ToolbarButton
        label={t("bulletList")}
        icon={<List aria-hidden="true" className="size-4" />}
        disabled={disabled}
        onClick={() => text.format((v, s, e) => toggleList(v, s, e, "bullets"))}
      />
      <ToolbarButton
        label={t("numberedList")}
        icon={<ListOrdered aria-hidden="true" className="size-4" />}
        disabled={disabled}
        onClick={() => text.format((v, s, e) => toggleList(v, s, e, "numbers"))}
      />
    </>
  );
}
