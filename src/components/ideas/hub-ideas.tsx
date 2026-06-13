"use client";

import { useState } from "react";
import { ChevronUp, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IDEA_CATEGORIES, type IdeaCategory } from "@/lib/idea-categories";

const statusStyles: Record<string, string> = {
  open: "text-zinc-500 border-zinc-200",
  implemented: "text-green-600 border-green-200 bg-green-50",
  rejected: "text-zinc-400 border-zinc-200 bg-zinc-50",
};

type CategoryFilter = IdeaCategory | "all";

export function HubIdeas({
  initialCategory,
  initialShowForm = false,
}: {
  initialCategory?: IdeaCategory;
  initialShowForm?: boolean;
}) {
  const t = useTranslations("hubIdeas");
  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(
    initialCategory ?? "all",
  );
  const [showForm, setShowForm] = useState(initialShowForm);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDesc, setIdeaDesc] = useState("");
  const [formCategory, setFormCategory] = useState<IdeaCategory>(
    initialCategory ?? "platform",
  );

  const { requireAuth } = useRequireAuth();
  const utils = api.useUtils();

  const queryInput = {
    sort,
    category: categoryFilter === "all" ? undefined : categoryFilter,
  };
  const { data: ideas = [], isLoading } =
    api.forum.getIdeas.useQuery(queryInput);

  const submitMutation = api.forum.submitIdea.useMutation({
    onSuccess: () => {
      setIdeaTitle("");
      setIdeaDesc("");
      setShowForm(false);
      void utils.forum.getIdeas.invalidate();
      toast.success(t("submitted"));
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(t("mustAcceptRules"));
        return;
      }
      toast.error(err.message);
    },
  });

  const voteMutation = api.forum.toggleVote.useMutation({
    onMutate: async ({ ideaId }) => {
      await utils.forum.getIdeas.cancel();
      const prev = utils.forum.getIdeas.getData(queryInput);
      utils.forum.getIdeas.setData(queryInput, (old) =>
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
      if (ctx?.prev) utils.forum.getIdeas.setData(queryInput, ctx.prev);
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(t("mustAcceptRules"));
        return;
      }
      toast.error(err.message);
    },
    onSettled: () => void utils.forum.getIdeas.invalidate(),
  });

  const categoryLabel = (c: IdeaCategory) =>
    c === "platform" ? t("categoryPlatform") : t("categoryAgentCapability");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Lightbulb className="text-primary h-5 w-5" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            requireAuth(() => setShowForm((v) => !v), t("signInToSuggest"))
          }
        >
          {t("suggest")}
        </Button>
      </div>

      {showForm && (
        <form
          className="border-border bg-secondary/30 mb-6 space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            requireAuth(
              () =>
                submitMutation.mutate({
                  title: ideaTitle,
                  description: ideaDesc || undefined,
                  category: formCategory,
                }),
              t("signInToSuggest"),
            );
          }}
        >
          <Input
            value={ideaTitle}
            onChange={(e) => setIdeaTitle(e.target.value)}
            placeholder={t("formTitlePlaceholder")}
            minLength={3}
            maxLength={100}
            required
          />
          <Textarea
            value={ideaDesc}
            onChange={(e) => setIdeaDesc(e.target.value)}
            placeholder={t("formDescriptionPlaceholder")}
            maxLength={500}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              {t("categoryLabel")}
            </span>
            {IDEA_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFormCategory(c)}
                aria-pressed={formCategory === c}
                className={`rounded px-2 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
                  formCategory === c
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={submitMutation.isPending}>
              {t("submit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowForm(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b pb-3">
        {(["votes", "recent"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            aria-pressed={sort === s}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              sort === s
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "votes" ? t("mostVoted") : t("recent")}
          </button>
        ))}
        <span className="text-border mx-1">|</span>
        {(["all", ...IDEA_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            aria-pressed={categoryFilter === c}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              categoryFilter === c
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "all" ? t("filterAll") : categoryLabel(c)}
          </button>
        ))}
      </div>

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
                    t("signInToVote"),
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
                  <span className="text-muted-foreground rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase">
                    {categoryLabel(idea.category)}
                  </span>
                  {idea.authorName && (
                    <span className="text-muted-foreground text-[10px]">
                      {idea.authorName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
