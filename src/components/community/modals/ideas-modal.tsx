"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronUp, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "../building-modal";
import { toast } from "sonner";

type IdeasModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  windowIndex?: number;
};

const statusStyles: Record<string, string> = {
  open: "text-zinc-500 border-zinc-200",
  implemented: "text-green-600 border-green-200 bg-green-50",
  rejected: "text-zinc-400 border-zinc-200 bg-zinc-50",
};

export function IdeasModal({ isOpen, onClose, title, subtitle, windowIndex }: IdeasModalProps) {
  const t = useTranslations("community.ideas");
  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [showForm, setShowForm] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDesc, setIdeaDesc] = useState("");

  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const { data: ideas = [], isLoading } = api.community.getIdeas.useQuery(
    { sort },
    { enabled: isOpen },
  );

  const submitMutation = api.community.submitIdea.useMutation({
    onSuccess: () => {
      setIdeaTitle("");
      setIdeaDesc("");
      setShowForm(false);
      void utils.community.getIdeas.invalidate();
      toast.success("Idea submitted!");
    },
    onError: (err) => toast.error(err.message),
  });

  const voteMutation = api.community.toggleVote.useMutation({
    onMutate: async ({ ideaId }) => {
      await utils.community.getIdeas.cancel();
      const prev = utils.community.getIdeas.getData({ sort });
      utils.community.getIdeas.setData({ sort }, (old) =>
        old?.map((idea) =>
          idea.id === ideaId
            ? {
                ...idea,
                hasVoted: !idea.hasVoted,
                voteCount: idea.hasVoted
                  ? (idea.voteCount ?? 0) - 1
                  : (idea.voteCount ?? 0) + 1,
              }
            : idea,
        ),
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.community.getIdeas.setData({ sort }, ctx.prev);
    },
    onSettled: () => void utils.community.getIdeas.invalidate(),
  });

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} windowIndex={windowIndex}>
      {/* Sort tabs */}
      <div className="mb-4 flex gap-1 border-b border-zinc-200 pb-3">
        {(["votes", "recent"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              sort === s
                ? "bg-orange-50 text-orange-600"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {s === "votes" ? t("mostVoted") : t("recent")}
          </button>
        ))}
      </div>

      {/* Ideas list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-100" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-zinc-400">{t("noIdeas")}</p>
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <motion.div
              key={idea.id}
              className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Vote button */}
              <button
                onClick={() => {
                  if (!session?.user) {
                    toast.info(t("loginToVote"));
                    return;
                  }
                  voteMutation.mutate({ ideaId: idea.id });
                }}
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded px-2 py-1.5 font-mono text-[10px] font-bold transition-colors ${
                  idea.hasVoted
                    ? "bg-orange-50 text-orange-600"
                    : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                <ChevronUp className="h-3 w-3" />
                {idea.voteCount ?? 0}
              </button>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-zinc-900">{idea.title}</p>
                {idea.description && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                    {idea.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${statusStyles[idea.status]}`}
                  >
                    {idea.status === "open"
                      ? t("statusOpen")
                      : idea.status === "implemented"
                        ? t("statusImplemented")
                        : t("statusRejected")}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Submit idea section */}
      <div className="mt-4 border-t border-zinc-200 pt-4">
        {!session?.user ? (
          <p className="font-mono text-[10px] text-zinc-400">{t("loginToSubmit")}</p>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-orange-600 transition-colors hover:text-orange-500"
          >
            <Lightbulb className="h-3 w-3" />
            {t("submit")}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitMutation.mutate({ title: ideaTitle, description: ideaDesc || undefined });
            }}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {t("titleLabel")}
              </label>
              <input
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                maxLength={100}
                required
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {t("descriptionLabel")}
              </label>
              <textarea
                value={ideaDesc}
                onChange={(e) => setIdeaDesc(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                maxLength={500}
                rows={3}
                className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="rounded-md bg-zinc-900 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitMutation.isPending ? t("submitting") : t("submit")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-zinc-200 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:bg-zinc-50"
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
