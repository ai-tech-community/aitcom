"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  magazineArticleEditPath,
  magazineWritePath,
} from "@/lib/magazines/paths";
import { mayWriterChange, writerStatusOf } from "@/lib/magazines/review";
import { api } from "@/trpc/react";

import { DeskList, UpdatedAt } from "./desk-list";

/** The writer's unpublished articles stay here until their issue comes out. */
export function ContributorDesk({ slug }: { slug: string }) {
  const t = useTranslations("magazineEditor.contributorDesk");
  const labelId = useId();
  const articles = api.magazines.myMagazineArticles.useQuery({ slug });
  const rows = articles.data ?? [];

  return (
    <section
      aria-labelledby={labelId}
      className="flex min-w-0 flex-col gap-6 rounded-xl border p-4 @xl:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={labelId} className="text-lg font-semibold tracking-tight">
          {t("label")}
        </h2>
        <Button variant="ink" size="sm" asChild>
          <Link href={magazineWritePath(slug)}>{t("write")}</Link>
        </Button>
      </div>
      <DeskList
        label={t("articles")}
        query={articles}
        empty={rows.length === 0 ? t("articlesEmpty") : null}
      >
        {rows.map((article) => {
          const content = (
            <>
              <span className="text-sm font-medium break-words">
                {article.title}
              </span>
              <span role="status" className="text-muted-foreground text-xs">
                {t(`status.${writerStatusOf(article.reviewStatus)}`)}
              </span>
              <UpdatedAt value={article.updatedAt} />
            </>
          );
          return (
            <li key={article.id}>
              {mayWriterChange(false, article) ? (
                <Link
                  href={magazineArticleEditPath(slug, article.slug)}
                  className="hover:bg-secondary/50 flex min-w-0 flex-col gap-1 px-3 py-2.5 transition-colors"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
                  {content}
                </div>
              )}
              {article.reviewNote && (
                <div className="flex flex-col gap-1 px-3 pb-3 text-sm">
                  <p className="font-medium">{t("editorNote")}</p>
                  <p className="text-muted-foreground break-words whitespace-pre-wrap">
                    {article.reviewNote}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </DeskList>
    </section>
  );
}
