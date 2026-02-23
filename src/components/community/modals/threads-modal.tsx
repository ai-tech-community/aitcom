"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "../building-modal";
import { toast } from "sonner";
import type { User } from "@/payload-types";

type ThreadsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  locale: string;
};

type Category = "all" | "general" | "question" | "showcase" | "job";

const categoryColors: Record<string, string> = {
  general: "text-zinc-400 border-zinc-700",
  question: "text-blue-400 border-blue-800",
  showcase: "text-purple-400 border-purple-800",
  job: "text-green-400 border-green-800",
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
}: ThreadsModalProps) {
  const t = useTranslations("community.threads");
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

  const { data: threads = [], isLoading } = api.community.getThreads.useQuery(
    { category },
    { enabled: isOpen },
  );

  const createMutation = api.community.createThread.useMutation({
    onSuccess: (thread) => {
      setShowForm(false);
      setForm({ title: "", content: "", category: "general" });
      void utils.community.getThreads.invalidate();
      onClose();
      router.push(`/${locale}/community/${thread.slug}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const tabs: { key: Category; label: string }[] = [
    { key: "all", label: t("all") },
    { key: "general", label: t("general") },
    { key: "question", label: t("question") },
    { key: "showcase", label: t("showcase") },
    { key: "job", label: t("job") },
  ];

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      {/* Category tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-zinc-800 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            className={`rounded px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              category === tab.key
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-zinc-500">{t("noThreads")}</p>
      ) : (
        <div className="space-y-1.5">
          {threads.map((thread) => {
            const authorUser =
              typeof thread.author === "object" ? (thread.author as User) : null;
            return (
              <motion.button
                key={thread.id}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-800/40 p-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  onClose();
                  router.push(`/${locale}/community/${thread.slug}`);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-zinc-200">
                    {thread.isPinned && (
                      <span className="mr-1 font-mono text-[9px] text-orange-500">
                        PIN
                      </span>
                    )}
                    {thread.title}
                  </p>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${categoryColors[thread.category]}`}
                  >
                    {t(thread.category)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
                    <MessageSquare className="h-2.5 w-2.5" />
                    {t("replies", { count: thread.replyCount ?? 0 })}
                  </span>
                  <span className="font-mono text-[9px] text-zinc-600">
                    {timeAgo(thread.lastActivityAt)}
                  </span>
                  {authorUser?.name && (
                    <span className="font-mono text-[9px] text-zinc-600">
                      {authorUser.name}
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* New thread section */}
      <div className="mt-4 border-t border-zinc-800 pt-4">
        {!session?.user ? (
          <p className="font-mono text-[10px] text-zinc-600">{t("loginToPost")}</p>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-200"
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
              <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {t("titleLabel")}
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("titlePlaceholder")}
                maxLength={255}
                required
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
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
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
              >
                <option value="general">{t("general")}</option>
                <option value="question">{t("question")}</option>
                <option value="showcase">{t("showcase")}</option>
                <option value="job">{t("job")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {t("contentLabel")}
              </label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={t("contentPlaceholder")}
                maxLength={10000}
                rows={4}
                required
                className="w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded bg-zinc-700 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-200 transition-colors hover:bg-zinc-600 disabled:opacity-50"
              >
                {createMutation.isPending ? "Posting..." : "Post"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded border border-zinc-700 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-300"
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
