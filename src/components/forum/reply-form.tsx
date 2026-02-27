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

  const replyMutation = api.community.addReply.useMutation({
    onSuccess: () => {
      setContent("");
      void utils.community.getReplies.invalidate({ threadId });
      void utils.community.getThreads.invalidate();
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
      <p className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-[10px] text-zinc-400">
        {t("threadLocked")}
      </p>
    );
  }

  if (!session?.user) {
    return (
      <p className="mt-6 font-mono text-[10px] text-zinc-400">
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
      className="mt-6 space-y-3"
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
          className="w-full resize-none rounded-b-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={replyMutation.isPending || !content.trim()}
          className="rounded-md bg-zinc-900 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {replyMutation.isPending ? t("replying") : t("reply")}
        </button>
      </div>
    </form>
  );
}
