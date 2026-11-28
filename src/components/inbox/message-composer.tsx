"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { EmojiPickerButton } from "@/components/composer/emoji-picker-button";
import {
  GifPickerButton,
  type PickedGif,
} from "@/components/composer/gif-picker-button";
import { MediaPreview } from "@/components/composer/media-preview";
import { applyEdit, insertAtCaret } from "@/components/composer/text-edit";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MESSAGE_MAX_LENGTH } from "@/lib/message-rules";
import type { AppRouter } from "@/server/api/root";

import { useSendMessage } from "./use-send-message";

/** The member-facing words for a failed send. */
function sendFailure(
  error: unknown,
  withGif: boolean,
): "gifGone" | "gifUnavailable" | "sendFailed" {
  const code =
    error instanceof TRPCClientError
      ? (error as TRPCClientError<AppRouter>).data?.code
      : undefined;
  if (code === "BAD_REQUEST" && withGif) return "gifGone";
  if (code === "PRECONDITION_FAILED") return "gifUnavailable";
  return "sendFailed";
}

/**
 * The one message composer every conversation view renders (floating chat
 * window, /messages, mobile inbox, community rooms): a text field, a
 * toolbar of extras on the left (emoji, and a GIF in conversations with
 * people) and the send button on the right. Enter sends, Shift+Enter makes
 * a new line. The field is uncontrolled; PromptInput empties it on send,
 * and a failed send puts the text back. A picked GIF shows above the field
 * until the message carrying it is sent.
 */
export function MessageComposer({
  conversationId,
  placeholder,
  kind,
}: {
  conversationId: string;
  placeholder: string;
  /** An agent conversation takes words only. */
  kind: "agent" | "person";
}) {
  const t = useTranslations("inbox");
  const tComposer = useTranslations("composer");
  const tMedia = useTranslations("media");
  const { send, isPending } = useSendMessage(conversationId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gifButtonRef = useRef<HTMLButtonElement>(null);
  const [gif, setGif] = useState<PickedGif | null>(null);

  const handleSubmit = useCallback(
    async ({ text }: { text: string }) => {
      const sent = gif;
      try {
        await send({ content: text, gif: sent });
        // A GIF picked while this one was sending stays for the next one.
        setGif((current) => (current === sent ? null : current));
      } catch (error) {
        // PromptInput emptied the field before sending. Give the text back,
        // in front of anything the member has typed since, as one undoable
        // edit with the caret at the end. A GIF-only message had none.
        const field = textareaRef.current;
        if (field && text.trim()) {
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
        // The GIF stays, unless the member has picked another since.
        setGif((current) => current ?? sent);
        const failure = sendFailure(error, sent !== null);
        toast.error(failure === "sendFailed" ? t(failure) : tComposer(failure));
        // PromptInput keeps everything else as it was on a failed send.
        throw error;
      }
    },
    [gif, send, t, tComposer],
  );

  const insertEmoji = useCallback((emoji: string) => {
    const field = textareaRef.current;
    insertAtCaret(field, emoji, (value) => {
      if (field) field.value = value;
    });
  }, []);

  const removeGif = useCallback(() => {
    setGif(null);
    // The preview and its button go: keep keyboard focus in the toolbar.
    gifButtonRef.current?.focus();
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <PromptInput onSubmit={handleSubmit}>
        {gif ? (
          <PromptInputHeader>
            <MediaPreview
              src={gif.preview.stillUrl}
              alt={gif.title}
              badge={tMedia("gifBadge")}
              removeLabel={tComposer("removeGif")}
              onRemove={removeGif}
              size="compact"
            />
          </PromptInputHeader>
        ) : null}
        <PromptInputTextarea
          ref={textareaRef}
          aria-label={t("messageLabel")}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={placeholder}
          className="min-h-10 text-sm"
        />
        <PromptInputFooter data-chat-toolbar="">
          <PromptInputTools>
            <EmojiPickerButton onPick={insertEmoji} />
            {kind === "person" ? (
              <GifPickerButton ref={gifButtonRef} onPick={setGif} />
            ) : null}
          </PromptInputTools>
          <PromptInputSubmit
            data-chat-send=""
            aria-label={t("send")}
            disabled={isPending}
          />
        </PromptInputFooter>
      </PromptInput>
    </TooltipProvider>
  );
}
