"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
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
      toast.error(err.message);
    },
  });

  if (isLocked) {
    return (
      <p className="mt-6 rounded-lg border border-border bg-muted px-4 py-3 font-mono text-[10px] text-muted-foreground">
        {t("threadLocked")}
      </p>
    );
  }

  if (!session?.user) {
    return (
      <p className="mt-6 font-mono text-[10px] text-muted-foreground">
        {t("loginToReply")}
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
      className="sticky bottom-0 border-t border-border bg-card p-4 sm:static sm:mt-6 sm:space-y-3 sm:border-0 sm:bg-transparent sm:p-0"
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
          className="w-full resize-none rounded-b-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={replyMutation.isPending || !content.trim()}
          className="rounded-md bg-foreground px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-background uppercase transition-colors hover:bg-foreground/90 disabled:opacity-50"
        >
          {replyMutation.isPending ? t("replying") : t("reply")}
        </button>
      </div>
    </form>
  );
}
