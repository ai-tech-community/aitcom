"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useInitialAuthUser } from "@/components/auth/session-provider";
import { resolveHubAuthUser } from "@/server/better-auth/hub-session";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { MarkdownToolbar } from "./markdown-toolbar";

type Category = "general" | "question" | "showcase" | "job";

export function CreateThreadForm() {
  const t = useTranslations("forum");
  const tRules = useTranslations("community.rules");
  const router = useRouter();
  const searchParams = useSearchParams();
  const communitySlug = searchParams.get("community") ?? undefined;
  const { data: session } = authClient.useSession();
  const user = resolveHubAuthUser(useInitialAuthUser(), session?.user);
  const { promptAuth } = useRequireAuth();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "general" as Category,
  });

  const backHref = (
    communitySlug ? `/communities/${communitySlug}/forum` : "/forum"
  ) as never;

  const createMutation = api.forum.createThread.useMutation({
    onSuccess: (thread) => {
      toast.success(t("threadCreated"));
      router.push(
        communitySlug
          ? (`/communities/${communitySlug}/forum/${thread.slug}` as never)
          : `/forum/${thread.slug}`,
      );
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(tRules("mustAccept"));
        return;
      }
      toast.error(err.message);
    },
  });

  if (!user) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground font-mono text-sm">
          <button
            type="button"
            onClick={() => promptAuth("Sign in to post")}
            className="hover:text-foreground underline transition-colors"
          >
            {t("loginToPost")}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Back to forum link */}
      <Link
        href={backHref}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("backToForum")}
      </Link>

      <h1 className="text-foreground mb-6 text-lg font-semibold">
        {t("createThread")}
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate({ ...form, communitySlug });
        }}
        className="space-y-4"
      >
        {/* Title */}
        <div>
          <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
            {t("titleLabel")}
          </label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t("titlePlaceholder")}
            maxLength={255}
            required
            className="border-border bg-background text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
            {t("categoryLabel")}
          </label>
          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as Category })
            }
            className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
          >
            <option value="general">{t("general")}</option>
            <option value="question">{t("question")}</option>
            <option value="showcase">{t("showcase")}</option>
            <option value="job">{t("job")}</option>
          </select>
        </div>

        {/* Content */}
        <div>
          <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
            {t("contentLabel")}
          </label>
          <MarkdownToolbar
            textareaRef={textareaRef}
            onUpdate={(v) => setForm({ ...form, content: v })}
          />
          <textarea
            ref={textareaRef}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder={t("contentPlaceholder")}
            maxLength={10000}
            rows={8}
            required
            className="border-border bg-background text-foreground placeholder:text-muted-foreground w-full resize-none rounded-b-md border px-3 py-2 text-sm focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-4 py-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? t("creating") : t("post")}
          </button>
          <Link
            href={backHref}
            className="border-border text-muted-foreground hover:bg-accent rounded-md border px-4 py-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors"
          >
            {t("cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
