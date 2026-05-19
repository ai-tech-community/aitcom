"use client";

import { use, useState } from "react";
import {
  ChevronUp,
  Lightbulb,
  MoreHorizontal,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusStyles: Record<string, string> = {
  open: "text-zinc-500 border-zinc-200",
  implemented: "text-green-600 border-green-200 bg-green-50",
  rejected: "text-zinc-400 border-zinc-200 bg-zinc-50",
};

export default function CommunityIdeasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("community.ideas");
  const tRules = useTranslations("community.rules");
  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [showForm, setShowForm] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDesc, setIdeaDesc] = useState("");

  const { data: session } = authClient.useSession();
  const { promptAuth, requireAuth } = useRequireAuth();
  const utils = api.useUtils();

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );
  const membership = myCommunities?.find((c) => c.slug === slug);
  const isAdminOrOwner =
    membership?.role === "owner" || membership?.role === "admin";

  const { data: ideas = [], isLoading } = api.forum.getIdeas.useQuery({
    sort,
    communitySlug: slug,
  });

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
      const prev = utils.forum.getIdeas.getData({ sort, communitySlug: slug });
      utils.forum.getIdeas.setData({ sort, communitySlug: slug }, (old) =>
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
      if (ctx?.prev)
        utils.forum.getIdeas.setData({ sort, communitySlug: slug }, ctx.prev);
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(tRules("mustAccept"));
      }
    },
    onSettled: () => void utils.forum.getIdeas.invalidate(),
  });

  const statusMutation = api.forum.updateIdeaStatus.useMutation({
    onSuccess: () => {
      void utils.forum.getIdeas.invalidate();
      toast.success(t("statusChanged"));
    },
  });

  return (
    <div>
      {/* Sort tabs */}
      <div className="mb-4 flex gap-1 border-b pb-3">
        {(["votes", "recent"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              sort === s
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "votes" ? t("mostVoted") : t("recent")}
          </button>
        ))}
      </div>

      {/* Ideas list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-muted h-14 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center font-mono text-xs">
          {t("noIdeas")}
        </p>
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="border-border bg-secondary/30 flex items-start gap-3 rounded-lg border p-3"
            >
              <button
                onClick={() =>
                  requireAuth(
                    () => voteMutation.mutate({ ideaId: idea.id }),
                    "Sign in to vote on ideas",
                  )
                }
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded px-2 py-1.5 font-mono text-[10px] font-bold transition-colors ${
                  idea.hasVoted
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ChevronUp className="h-3 w-3" />
                {idea.voteCount ?? 0}
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium">{idea.title}</p>
                {idea.description && (
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-relaxed">
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
                  {isAdminOrOwner && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-0.5 hover:bg-zinc-100">
                        <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {idea.status !== "implemented" && (
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({
                                ideaId: idea.id,
                                status: "implemented",
                              })
                            }
                          >
                            <Check className="mr-2 h-3.5 w-3.5" />
                            {t("markImplemented")}
                          </DropdownMenuItem>
                        )}
                        {idea.status !== "rejected" && (
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({
                                ideaId: idea.id,
                                status: "rejected",
                              })
                            }
                          >
                            <X className="mr-2 h-3.5 w-3.5" />
                            {t("markRejected")}
                          </DropdownMenuItem>
                        )}
                        {idea.status !== "open" && (
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({
                                ideaId: idea.id,
                                status: "open",
                              })
                            }
                          >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            {t("reopen")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit idea section */}
      <div className="mt-4 border-t pt-4">
        {!session?.user ? (
          <button
            type="button"
            onClick={() => promptAuth("Sign in to submit an idea")}
            className="text-muted-foreground hover:text-foreground font-mono text-[10px] underline underline-offset-4"
          >
            {t("loginToSubmit")}
          </button>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="text-primary hover:text-primary/80 flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors"
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
                communitySlug: slug,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="text-muted-foreground mb-1 block font-mono text-[10px] font-semibold tracking-wider uppercase">
                {t("titleLabel")}
              </label>
              <input
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                maxLength={100}
                required
                className="border-border focus:ring-primary/30 focus:border-primary w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:opacity-50 focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block font-mono text-[10px] font-semibold tracking-wider uppercase">
                {t("descriptionLabel")}
              </label>
              <textarea
                value={ideaDesc}
                onChange={(e) => setIdeaDesc(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                maxLength={500}
                rows={3}
                className="border-border focus:ring-primary/30 focus:border-primary w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm placeholder:opacity-50 focus:ring-1 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors disabled:opacity-50"
              >
                {submitMutation.isPending ? t("submitting") : t("submit")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border-border text-muted-foreground hover:bg-secondary rounded-md border px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
