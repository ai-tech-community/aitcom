"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { MessageSquare, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "../building-modal";
import { toast } from "sonner";

type ThreadsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  locale: string;
  windowIndex?: number;
};

type Category = "all" | "general" | "question" | "showcase" | "job";

const categoryStyles: Record<string, string> = {
  general: "text-zinc-500 border-zinc-200",
  question: "text-blue-600 border-blue-200 bg-blue-50",
  showcase: "text-purple-600 border-purple-200 bg-purple-50",
  job: "text-green-600 border-green-200 bg-green-50",
};

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ThreadsModal({
  isOpen,
  onClose,
  title,
  subtitle,
  locale,
  windowIndex,
}: ThreadsModalProps) {
  const t = useTranslations("community.threads");
  const tRules = useTranslations("community.rules");
  const [category, setCategory] = useState<Category>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "general" as Exclude<Category, "all">,
  });
  const router = useRouter();

  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const { data, isLoading } = api.forum.getThreads.useQuery(
    { category },
    { enabled: isOpen },
  );
  const threads = data?.threads ?? [];

  const createMutation = api.forum.createThread.useMutation({
    onSuccess: (thread) => {
      setShowForm(false);
      setForm({ title: "", content: "", category: "general" });
      void utils.forum.getThreads.invalidate();
      onClose();
      router.push(`/${locale}/community/${thread.slug}`);
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(tRules("mustAccept"));
        return;
      }
      toast.error(err.message);
    },
  });

  const tabs: { key: Category; label: string }[] = [
    { key: "all", label: t("all") },
    { key: "general", label: t("general") },
    { key: "question", label: t("question") },
    { key: "showcase", label: t("showcase") },
    { key: "job", label: t("job") },
  ];

  return (
    <BuildingModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      windowIndex={windowIndex}
    >
      {/* Category tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-zinc-200 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            className={`rounded px-2.5 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              category === tab.key
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-16 animate-pulse rounded-lg bg-zinc-100"
            />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-zinc-400">
          {t("noThreads")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <m.button
              key={thread.id}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => {
                onClose();
                router.push(`/${locale}/community/${thread.slug}`);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-snug font-medium text-zinc-900">
                  {thread.isPinned && (
                    <span className="mr-1 font-mono text-[9px] text-orange-600">
                      PIN
                    </span>
                  )}
                  {thread.title}
                </p>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase ${categoryStyles[thread.category]}`}
                >
                  {t(thread.category)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-400">
                  <MessageSquare className="h-2.5 w-2.5" />
                  {t("replies", { count: thread.replyCount ?? 0 })}
                </span>
                <span className="font-mono text-[9px] text-zinc-400">
                  {timeAgo(thread.lastActivityAt)}
                </span>
                {thread.authorName && (
                  <span className="font-mono text-[9px] text-zinc-400">
                    {thread.authorName}
                  </span>
                )}
              </div>
            </m.button>
          ))}
        </div>
      )}

      {/* New thread section */}
      <div className="mt-4 border-t border-zinc-200 pt-4">
        {!session?.user ? (
          <p className="font-mono text-[10px] text-zinc-400">
            {t("loginToPost")}
          </p>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-zinc-500 uppercase transition-colors hover:text-zinc-900"
          >
            <Plus className="h-3 w-3" />
            {t("newThread")}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                {t("titleLabel")}
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("titlePlaceholder")}
                maxLength={255}
                required
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                {t("categoryLabel")}
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as typeof form.category,
                  })
                }
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              >
                <option value="general">{t("general")}</option>
                <option value="question">{t("question")}</option>
                <option value="showcase">{t("showcase")}</option>
                <option value="job">{t("job")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                {t("contentLabel")}
              </label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={t("contentPlaceholder")}
                maxLength={10000}
                rows={4}
                required
                className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-md bg-zinc-900 px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-white uppercase transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {createMutation.isPending ? "Posting..." : "Post"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-zinc-200 px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-zinc-500 uppercase transition-colors hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </BuildingModal>
  );
}
