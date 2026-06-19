"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { MessageSquare, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { RelativeTime } from "@/components/ui/relative-time";
import { ErrorState } from "@/components/ui/error-state";
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
  general: "text-muted-foreground border-border bg-secondary",
  question: "text-muted-foreground border-border bg-secondary",
  showcase: "text-muted-foreground border-border bg-secondary",
  job: "text-muted-foreground border-border bg-secondary",
};

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

  const { data, isLoading, isError, refetch } = api.forum.getThreads.useQuery(
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
      <div className="border-border mb-4 flex flex-wrap gap-1 border-b pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            className={`rounded px-2.5 py-1 font-mono text-xs font-semibold tracking-widest uppercase transition-colors ${
              category === tab.key
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
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
            <div key={n} className="bg-muted h-16 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} className="py-8" />
      ) : threads.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center font-mono text-xs">
          {t("noThreads")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <m.button
              key={thread.id}
              className="border-border bg-muted/50 hover:border-border hover:bg-muted w-full rounded-lg border p-3 text-left transition-colors"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => {
                onClose();
                router.push(`/${locale}/community/${thread.slug}`);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground text-sm leading-snug font-medium">
                  {thread.isPinned && (
                    <span className="mr-1 font-mono text-xs text-orange-600">
                      PIN
                    </span>
                  )}
                  {thread.title}
                </p>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider uppercase ${categoryStyles[thread.category]}`}
                >
                  {t(thread.category)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
                  <MessageSquare className="h-2.5 w-2.5" />
                  {t("replies", { count: thread.replyCount ?? 0 })}
                </span>
                {thread.lastActivityAt && (
                  <RelativeTime
                    date={thread.lastActivityAt}
                    className="text-muted-foreground text-xs"
                  />
                )}
                {thread.authorName && (
                  <span className="text-muted-foreground font-mono text-xs">
                    {thread.authorName}
                  </span>
                )}
              </div>
            </m.button>
          ))}
        </div>
      )}

      {/* New thread section */}
      <div className="border-border mt-4 border-t pt-4">
        {!session?.user ? (
          <p className="text-muted-foreground font-mono text-xs">
            {t("loginToPost")}
          </p>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors"
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
              <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
                {t("titleLabel")}
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("titlePlaceholder")}
                maxLength={255}
                required
                className="border-border bg-card text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
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
                className="border-border bg-card text-foreground w-full rounded-md border px-3 py-2 text-sm focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              >
                <option value="general">{t("general")}</option>
                <option value="question">{t("question")}</option>
                <option value="showcase">{t("showcase")}</option>
                <option value="job">{t("job")}</option>
              </select>
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
                {t("contentLabel")}
              </label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={t("contentPlaceholder")}
                maxLength={10000}
                rows={4}
                required
                className="border-border bg-card text-foreground placeholder:text-muted-foreground w-full resize-none rounded-md border px-3 py-2 text-sm focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-4 py-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? "Posting..." : "Post"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border-border text-muted-foreground hover:bg-muted rounded-md border px-4 py-1.5 font-mono text-xs font-semibold tracking-widest uppercase transition-colors"
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
