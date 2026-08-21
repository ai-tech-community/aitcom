"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";
import { MarkdownToolbar } from "./markdown-toolbar";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ReplyFormProps = {
  threadId: number;
  isLocked: boolean;
};

export function ReplyForm({ threadId, isLocked }: ReplyFormProps) {
  const t = useTranslations("forum");
  const tRules = useTranslations("community.rules");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const { data: session } = authClient.useSession();
  const { promptAuth } = useRequireAuth();
  const utils = api.useUtils();

  const replyMutation = api.forum.addReply.useMutation({
    onSuccess: () => {
      setContent("");
      void utils.forum.getReplies.invalidate({ threadId });
      void utils.forum.getThreads.invalidate();
      toast.success(t("replyPosted"));
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(tRules("mustAccept"));
        return;
      }
      toast.error(err.message.trim() ? err.message : t("replyFailed"));
    },
  });

  if (isLocked) {
    return (
      <p className="border-border bg-muted text-muted-foreground mt-6 rounded-lg border px-4 py-3 font-mono text-xs">
        {t("threadLocked")}
      </p>
    );
  }

  if (!session?.user) {
    return (
      <p className="text-muted-foreground mt-6 font-mono text-xs">
        <button
          type="button"
          onClick={() => promptAuth("Sign in to reply")}
          className="hover:text-foreground underline transition-colors"
        >
          {t("loginToReply")}
        </button>
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        replyMutation.mutate({ threadId, content: content.trim() });
      }}
      className="border-border bg-card sticky bottom-0 border-t p-4 sm:static sm:mt-6 sm:space-y-3 sm:border-0 sm:bg-transparent sm:p-0"
    >
      <div>
        <MarkdownToolbar
          textareaRef={textareaRef}
          onUpdate={(v) => setContent(v)}
        />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("replyPlaceholder")}
          maxLength={10000}
          rows={3}
          required
          className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring w-full resize-none rounded-b-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={replyMutation.isPending || !content.trim()}
          className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-4 py-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors disabled:opacity-50"
        >
          {replyMutation.isPending ? t("replying") : t("reply")}
        </button>
      </div>
    </form>
  );
}
