import { ArrowLeft } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";
import { communityMagazinePath } from "@/lib/magazines/paths";
import type { ReviewPageData } from "@/server/magazines/article-review";

import { ReviewActions } from "./review-actions";

/** Read the submitted text in the community frame, then decide below it. */
export function ArticleReviewView({
  data,
  communitySlug,
}: {
  data: ReviewPageData;
  communitySlug: string;
}) {
  const t = useTranslations("magazineEditor.review");
  const format = useFormatter();
  const { article } = data;
  const decided =
    article.reviewStatus === "approved" ||
    article.reviewStatus === "changes_requested" ||
    article.reviewStatus === "rejected"
      ? article.reviewStatus
      : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start whitespace-normal"
        asChild
      >
        <Link href={communityMagazinePath(communitySlug)}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("back")}
        </Link>
      </Button>
      <article className="flex w-full max-w-[72ch] min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance break-words sm:text-4xl">
            {article.title}
          </h1>
          <p className="text-muted-foreground text-sm break-words">
            {t.rich("byline", {
              author: article.authorName ?? t("unknownAuthor"),
              dateLabel: format.dateTime(new Date(article.updatedAt), {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              date: (chunks) => (
                <time
                  dateTime={article.updatedAt}
                  className="font-mono text-xs"
                >
                  {chunks}
                </time>
              ),
            })}
          </p>
          {decided && (
            <div
              role="status"
              className="flex flex-col gap-2 border-y py-3 text-sm"
            >
              <p className="font-medium">{t(`status.${decided}`)}</p>
              {article.reviewNote && decided !== "approved" && (
                <p className="break-words whitespace-pre-wrap">
                  {article.reviewNote}
                </p>
              )}
            </div>
          )}
        </header>
        <div className="min-w-0 [overflow-wrap:anywhere] break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto">
          <LexicalRenderer content={article.content} />
        </div>
        {article.reviewStatus === "pending_review" && (
          <ReviewActions
            communitySlug={communitySlug}
            articleId={article.id}
            articleTitle={article.title}
          />
        )}
      </article>
    </div>
  );
}
