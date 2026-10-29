"use client";

import { useEffect } from "react";
import {
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
} from "@payloadcms/richtext-lexical/lexical";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";

import { planPaste } from "@/lib/articles/inline-markdown";

import { $applyArticlePaste } from "./article-paste";

function clipboardText(event: ClipboardEvent | InputEvent | KeyboardEvent) {
  if (event instanceof ClipboardEvent) {
    return event.clipboardData?.getData("text/plain") ?? "";
  }
  return null;
}

/** Turns a pasted URL into a video block, and markdown links and emphasis into marks. */
export function ArticlePastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const text = clipboardText(event);
        if (text === null || planPaste(text).kind === "default") return false;
        event.preventDefault();
        editor.update(() => {
          $applyArticlePaste(text);
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
