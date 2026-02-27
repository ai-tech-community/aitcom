"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

type Category = "general" | "question" | "showcase" | "job";

export function CreateThreadForm() {
  const t = useTranslations("forum");
  const tRules = useTranslations("community.rules");
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "general" as Category,
  });

  const createMutation = api.community.createThread.useMutation({
    onSuccess: (thread) => {
      toast.success(t("threadCreated"));
      router.push(`/forum/${thread.slug}`);
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(tRules("mustAccept"));
        return;
      }
      toast.error(err.message);
    },
  });

  if (!session?.user) {
    return (
      <div className="py-12 text-center">
        <p className="font-mono text-sm text-zinc-400">{t("loginToPost")}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Back to forum link */}
      <Link
        href="/forum"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("backToForum")}
      </Link>

      <h1 className="mb-6 text-lg font-bold text-zinc-900">
        {t("createThread")}
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate(form);
        }}
        className="space-y-4"
      >
        {/* Title */}
        <div>
          <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {t("titleLabel")}
          </label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t("titlePlaceholder")}
            maxLength={255}
            required
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300"
          />
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {t("categoryLabel")}
          </label>
          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as Category })
            }
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300"
          >
            <option value="general">{t("general")}</option>
            <option value="question">{t("question")}</option>
            <option value="showcase">{t("showcase")}</option>
            <option value="job">{t("job")}</option>
          </select>
        </div>

        {/* Content */}
        <div>
          <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {t("contentLabel")}
          </label>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder={t("contentPlaceholder")}
            maxLength={10000}
            rows={8}
            required
            className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-zinc-900 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {createMutation.isPending ? t("creating") : t("post")}
          </button>
          <Link
            href="/forum"
            className="rounded-md border border-zinc-200 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:bg-zinc-50"
          >
            {t("cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
