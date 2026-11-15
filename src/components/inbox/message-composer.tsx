"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { EmojiPickerButton } from "@/components/composer/emoji-picker-button";
import { applyEdit, insertAtCaret } from "@/components/composer/text-edit";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MESSAGE_MAX_LENGTH } from "@/lib/message-rules";

import { useSendMessage } from "./use-send-message";

/**
 * The one message composer every conversation view renders (floating chat
 * window, /messages, mobile inbox, community rooms): a text field, a
 * toolbar of extras on the left (emoji) and the send button on the right.
 * Enter sends, Shift+Enter makes a new line. The field is uncontrolled;
 * PromptInput empties it on send, and a failed send puts the text back.
 */
export function MessageComposer({
  conversationId,
  placeholder,
}: {
  conversationId: string;
  placeholder: string;
}) {
  const t = useTranslations("inbox");
  const { send, isPending } = useSendMessage(conversationId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    async ({ text }: { text: string }) => {
      try {
        await send(text);
      } catch (error) {
        // PromptInput emptied the field before sending. Give the text back,
        // in front of anything the member has typed since, as one undoable
        // edit with the caret at the end.
        const field = textareaRef.current;
        if (field) {
          const typed = field.value;
          const value = typed ? `${text}\n${typed}` : text;
          applyEdit(
            field,
            { value, start: value.length, end: value.length },
            (next) => {
              field.value = next;
            },
          );
        }
        toast.error(t("sendFailed"));
        // PromptInput keeps everything else as it was on a failed send.
        throw error;
      }
    },
    [send, t],
  );

  const insertEmoji = useCallback((emoji: string) => {
    const field = textareaRef.current;
    insertAtCaret(field, emoji, (value) => {
      if (field) field.value = value;
    });
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          ref={textareaRef}
          aria-label={t("messageLabel")}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={placeholder}
          className="min-h-10 text-sm"
        />
        <PromptInputFooter>
          <PromptInputTools>
            <EmojiPickerButton onPick={insertEmoji} />
          </PromptInputTools>
          <PromptInputSubmit aria-label={t("send")} disabled={isPending} />
        </PromptInputFooter>
      </PromptInput>
    </TooltipProvider>
  );
}
