"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";

type ThreadReplyFormProps = {
  threadId: number;
  isLocked: boolean;
};

export function ThreadReplyForm({ threadId, isLocked }: ThreadReplyFormProps) {
  const t = useTranslations("community.threads");
  const tRules = useTranslations("community.rules");
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
      toast.error(err.message);
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
        replyMutation.mutate({ threadId, content });
      }}
      className="mt-6 space-y-3"
    >
      <label className="text-muted-foreground block font-mono text-xs font-semibold tracking-wider uppercase">
        {t("replyLabel")}
      </label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("replyPlaceholder")}
        maxLength={10000}
        rows={3}
        required
        className="border-border bg-card text-foreground placeholder:text-muted-foreground w-full resize-none rounded-md border px-3 py-2 text-sm focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={replyMutation.isPending}
          className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-4 py-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors disabled:opacity-50"
        >
          {replyMutation.isPending ? t("replying") : t("reply")}
        </button>
      </div>
    </form>
  );
}
