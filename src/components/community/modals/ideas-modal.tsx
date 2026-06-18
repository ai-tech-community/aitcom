"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { ChevronUp, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
  open: "text-muted-foreground border-border",
  implemented: "text-success border-success/30 bg-success/15",
  rejected: "text-muted-foreground border-border bg-muted",
};

export function IdeasModal({
  isOpen,
  onClose,
  title,
  subtitle,
  windowIndex,
}: IdeasModalProps) {
  const t = useTranslations("community.ideas");
  const tRules = useTranslations("community.rules");
  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [showForm, setShowForm] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDesc, setIdeaDesc] = useState("");

  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const { data: ideas = [], isLoading } = api.forum.getIdeas.useQuery(
    { sort },
    { enabled: isOpen },
  );

  const submitMutation = api.forum.submitIdea.useMutation({
    onSuccess: () => {
      setIdeaTitle("");
      setIdeaDesc("");
      setShowForm(false);
      void utils.forum.getIdeas.invalidate();
      toast.success("Idea submitted!");
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(tRules("mustAccept"));
        return;
      }
      toast.error(err.message);
    },
  });

  const voteMutation = api.forum.toggleVote.useMutation({
    onMutate: async ({ ideaId }) => {
      await utils.forum.getIdeas.cancel();
      const prev = utils.forum.getIdeas.getData({ sort });
      utils.forum.getIdeas.setData({ sort }, (old) =>
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
    onError: (err, _input, ctx) => {
      if (ctx?.prev) utils.forum.getIdeas.setData({ sort }, ctx.prev);
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(tRules("mustAccept"));
      }
    },
    onSettled: () => void utils.forum.getIdeas.invalidate(),
  });

  return (
    <BuildingModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      windowIndex={windowIndex}
    >
      {/* Sort tabs */}
      <div className="mb-4 border-b border-border pb-3">
        <SegmentedControl
          aria-label={t("mostVoted")}
          value={sort}
          onValueChange={setSort}
          options={[
            { value: "votes", label: t("mostVoted") },
            { value: "recent", label: t("recent") },
          ]}
        />
      </div>

      {/* Ideas list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-14 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-muted-foreground">
          {t("noIdeas")}
        </p>
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <m.div
              key={idea.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3"
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
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ChevronUp className="h-3 w-3" />
                {idea.voteCount ?? 0}
              </button>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium text-foreground">
                  {idea.title}
                </p>
                {idea.description && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {idea.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase ${statusStyles[idea.status]}`}
                  >
                    {idea.status === "open"
                      ? t("statusOpen")
                      : idea.status === "implemented"
                        ? t("statusImplemented")
                        : t("statusRejected")}
                  </span>
                </div>
              </div>
            </m.div>
          ))}
        </div>
      )}

      {/* Submit idea section */}
      <div className="mt-4 border-t border-border pt-4">
        {!session?.user ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            {t("loginToSubmit")}
          </p>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-orange-600 uppercase transition-colors hover:text-orange-500"
          >
            <Lightbulb className="h-3 w-3" />
            {t("submit")}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitMutation.mutate({
                title: ideaTitle,
                description: ideaDesc || undefined,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("titleLabel")}
              </label>
              <input
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                maxLength={100}
                required
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("descriptionLabel")}
              </label>
              <textarea
                value={ideaDesc}
                onChange={(e) => setIdeaDesc(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                maxLength={500}
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-orange-300 focus:ring-1 focus:ring-orange-300 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="rounded-md bg-foreground px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-background uppercase transition-colors hover:bg-foreground/90 disabled:opacity-50"
              >
                {submitMutation.isPending ? t("submitting") : t("submit")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-border px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase transition-colors hover:bg-muted"
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
