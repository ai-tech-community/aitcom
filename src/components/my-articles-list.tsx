"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { toast } from "sonner";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

const statusColors: Record<string, string> = {
  draft: "border-zinc-500/40 text-zinc-400",
  published: "border-green-500/40 text-green-400",
};

const reviewColors: Record<string, string> = {
  pending_review: "border-yellow-500/40 text-yellow-400",
  approved: "border-green-500/40 text-green-400",
  changes_requested: "border-orange-500/40 text-orange-400",
  rejected: "border-red-500/40 text-red-400",
};

const reviewStatusKeys: Record<string, string> = {
  pending_review: "pendingReview",
  approved: "approved",
  changes_requested: "changesRequested",
  rejected: "rejected",
};

const statusKeys: Record<string, string> = {
  draft: "draft",
  published: "published",
};

export function MyArticlesList() {
  const t = useTranslations("articleEditor");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const {
    data: articles,
    isLoading,
    refetch,
  } = api.articles.myArticles.useQuery();
  const deleteMutation = api.articles.delete.useMutation({
    onSuccess: () => {
      toast.success(t("deleted"));
      void refetch();
    },
    onError: () => {
      toast.error(t("failedToDelete"));
    },
  });

  const handleDelete = (id: number) => {
    if (!window.confirm(t("confirmDelete"))) return;
    setDeletingId(id);
    deleteMutation.mutate(
      { id },
      {
        onSettled: () => setDeletingId(null),
      },
    );
  };

  const canDelete = (status: string, reviewStatus?: string | null) =>
    status === "draft" || reviewStatus === "changes_requested";

  if (isLoading) {
    return (
      <div className="border-border border-b pb-4">
        <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("myArticles").toUpperCase()}
        </h1>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("myArticles").toUpperCase()}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("manageDescription")}
          </p>
        </div>
        <Link
          href="/blog/write"
          className="bg-foreground text-background hover:bg-foreground/90 rounded px-4 py-2 font-mono text-xs tracking-wider transition-colors"
        >
          + {t("write").toUpperCase()}
        </Link>
      </div>

      {!articles || articles.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">{t("noArticles")}</p>
          <Link
            href="/blog/write"
            className="text-foreground mt-4 inline-block font-mono text-xs tracking-wider underline underline-offset-4"
          >
            {t("writeFirst")}
          </Link>
        </div>
      ) : (
        <>
          {/* Table Header - desktop */}
          <div className="border-border hidden items-center border-b px-4 py-2.5 sm:flex">
            <span className="text-muted-foreground w-28 font-mono text-xs font-medium tracking-wider">
              / {t("date").toUpperCase()}
            </span>
            <span className="text-muted-foreground flex-1 font-mono text-xs font-medium tracking-wider">
              / {t("title").toUpperCase()}
            </span>
            <span className="text-muted-foreground w-24 font-mono text-xs font-medium tracking-wider">
              / {t("status").toUpperCase()}
            </span>
            <span className="text-muted-foreground w-36 font-mono text-xs font-medium tracking-wider">
              / {t("review").toUpperCase()}
            </span>
            <span className="text-muted-foreground w-24 font-mono text-xs font-medium tracking-wider">
              / {t("actions").toUpperCase()}
            </span>
          </div>

          {/* Article Rows */}
          {articles.map((article) => (
            <div
              key={article.id}
              className="border-border flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-center sm:gap-0 sm:py-3.5"
            >
              {/* Title */}
              <span className="text-base leading-snug font-medium sm:order-2 sm:flex-1">
                {article.title}
              </span>

              {/* Date */}
              <div className="flex items-center gap-3 sm:order-1 sm:w-28">
                <div className="bg-foreground h-2 w-2 rounded-full" />
                <span className="font-mono text-xs">
                  {article.updatedAt ? formatDate(article.updatedAt) : "-"}
                </span>
              </div>

              {/* Status badge */}
              <span
                className={`w-fit rounded border px-2 py-0.5 font-mono text-xs font-medium tracking-wider sm:order-3 sm:w-24 ${
                  statusColors[article.status] ??
                  "border-zinc-500/40 text-zinc-400"
                }`}
              >
                {t(statusKeys[article.status] ?? article.status).toUpperCase()}
              </span>

              {/* Review status */}
              <span className="sm:order-4 sm:w-36">
                {article.reviewStatus ? (
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-xs font-medium tracking-wider ${
                      reviewColors[article.reviewStatus] ?? ""
                    }`}
                  >
                    {(() => {
                      const reviewKey = reviewStatusKeys[article.reviewStatus];
                      return (
                        reviewKey ? t(reviewKey) : article.reviewStatus
                      ).toUpperCase();
                    })()}
                  </span>
                ) : (
                  <span className="text-muted-foreground font-mono text-xs">
                    -
                  </span>
                )}
              </span>

              {/* Actions */}
              <div className="flex gap-2 sm:order-5 sm:w-24">
                <Link
                  href={`/blog/edit/${article.slug}`}
                  className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
                >
                  {t("edit").toUpperCase()}
                </Link>
                {canDelete(article.status, article.reviewStatus) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(article.id)}
                    disabled={deletingId === article.id}
                    className="font-mono text-xs tracking-wider text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                  >
                    {t("delete").toUpperCase()}
                  </button>
                )}
              </div>

              {/* Review note - full width */}
              {article.reviewStatus === "changes_requested" &&
                article.reviewNote && (
                  <div className="mt-1 w-full rounded border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs sm:order-6">
                    {article.reviewNote}
                  </div>
                )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
