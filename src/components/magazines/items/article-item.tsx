import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import type { ItemRendererProps, ItemTitle } from "./types";

/** An original magazine article: title, byline and, as the lead, its opening. */
export function ArticleItem({
  view,
  lead,
  href,
}: ItemRendererProps<"article">) {
  const t = useTranslations("magazines.item");
  const { article } = view;
  const url = href(article.slug);

  return (
    <article
      data-item-kind="article"
      className="bg-card text-card-foreground flex h-full flex-col overflow-hidden rounded-xl border"
    >
      {lead && article.imageUrl && (
        // Any host an editor links to: next/image only serves listed hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          className="aspect-[2/1] w-full border-b object-cover"
        />
      )}
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 p-5",
          lead && "gap-3 @xl:p-8",
        )}
      >
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            lead
              ? "text-2xl leading-tight @xl:text-3xl"
              : "text-lg leading-snug",
          )}
        >
          <Link
            href={url}
            className="underline-offset-4 hover:underline focus-visible:underline"
          >
            {article.title}
          </Link>
        </h2>
        <p className="text-muted-foreground text-sm">
          {article.authorName && (
            <>
              {t("byAuthor", { name: article.authorName })}
              <span aria-hidden="true"> · </span>
            </>
          )}
          <span className="font-mono text-xs">
            {t("readingTime", { minutes: article.readingMinutes })}
          </span>
        </p>
        {view.intro && <p className="text-sm">{view.intro}</p>}
        {lead && article.excerpt && (
          <p className="text-muted-foreground leading-relaxed">
            {article.excerpt}
          </p>
        )}
        {lead && (
          <Link
            href={url}
            className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium underline-offset-4 hover:underline"
          >
            {t("readArticle")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
    </article>
  );
}

export const articleItemTitle: ItemTitle<"article"> = (view) =>
  view.article.title;
