"use client";

import { useCallback, useRef } from "react";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { EmojiPickerButton } from "@/components/composer/emoji-picker-button";
import { insertAtCaret } from "@/components/composer/text-edit";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useSendMessage } from "./use-send-message";

/**
 * The one message composer every inbox view renders (floating chat window,
 * /messages, mobile inbox): a text field, a toolbar of extras on the left
 * (emoji) and the send button on the right. Enter sends, Shift+Enter makes
 * a new line. The field is uncontrolled; PromptInput empties it on send.
 */
export function MessageComposer({
  conversationId,
  placeholder,
}: {
  conversationId: string;
  placeholder: string;
}) {
  const { send, isPending } = useSendMessage(conversationId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    async ({ text }: { text: string }) => {
      const content = text.trim();
      if (!content) return;
      await send(content);
    },
    [send],
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
          placeholder={placeholder}
          className="min-h-10 text-sm"
        />
        <PromptInputFooter>
          <PromptInputTools>
            <EmojiPickerButton onPick={insertEmoji} />
          </PromptInputTools>
          <PromptInputSubmit disabled={isPending} />
        </PromptInputFooter>
      </PromptInput>
    </TooltipProvider>
  );
}
