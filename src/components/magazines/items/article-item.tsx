import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { EditorialImage } from "../reading/editorial-image";

import { FactSeparator } from "./fact-separator";
import { ItemRow } from "./item-row";
import type { ItemRendererProps, ItemTitle } from "./types";

/** An original magazine article: title, byline and, as the lead, its opening. */
export function ArticleItem({
  view,
  size,
  href,
  teaser,
  suppressSourceImage = false,
}: ItemRendererProps<"article">) {
  const t = useTranslations("magazines.item");
  const { article } = view;
  const url = href(article.slug);

  switch (size) {
    case "row":
      return (
        <ItemRow
          kind="article"
          title={
            <Link
              href={url}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {article.title}
            </Link>
          }
          label={t("articleKind")}
          intro={view.intro}
          fact={t("readingTime", { minutes: article.readingMinutes })}
          note={
            teaser ? (
              <p className="text-muted-foreground text-sm">
                {t("membersReadAll")}
              </p>
            ) : null
          }
        />
      );
    case "lead":
    case "card":
    case "related":
      break;
    default: {
      const exhaustive: never = size;
      return exhaustive;
    }
  }
  const isLead = size === "lead";

  return (
    <article
      data-item-kind="article"
      className={cn(
        "flex h-full flex-col",
        isLead
          ? "gap-5"
          : "bg-card text-card-foreground overflow-hidden rounded-xl border",
      )}
    >
      {!suppressSourceImage && isLead && article.imageUrl && (
        <div className="bg-secondary relative aspect-[3/2] w-full overflow-hidden">
          <EditorialImage
            src={article.imageUrl}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 70vw"
            className="aspect-[2/1] object-cover"
          />
        </div>
      )}
      <div
        className={cn("flex flex-1 flex-col gap-2", isLead ? "gap-4" : "p-5")}
      >
        {isLead && (
          <p className="font-mono text-xs tracking-[0.16em] text-[color:var(--magazine-accent-ink)] uppercase">
            {t("articleKind")}
          </p>
        )}
        <h2
          className={cn(
            "text-balance",
            isLead
              ? "magazine-display text-4xl leading-[1.05] font-medium @xl:text-5xl"
              : "text-lg leading-snug font-semibold",
          )}
        >
          <Link
            href={url}
            className="underline-offset-4 hover:underline focus-visible:underline"
          >
            {article.title}
          </Link>
        </h2>
        {view.intro && <p className="text-sm">{view.intro}</p>}
        <p className="text-muted-foreground text-sm">
          {article.authorName && (
            <>
              {t("byAuthor", { name: article.authorName })}
              <FactSeparator />
            </>
          )}
          <span className="font-mono text-xs">
            {t("readingTime", { minutes: article.readingMinutes })}
          </span>
        </p>
        {!teaser && (isLead || size === "related") && article.excerpt && (
          <p className="text-muted-foreground leading-relaxed">
            {article.excerpt}
          </p>
        )}
        {teaser ? (
          <>
            {article.opening && (
              <p className="leading-relaxed">{article.opening}</p>
            )}
            {teaser.inlinePrompt}
          </>
        ) : (
          isLead && (
            <Link
              href={url}
              className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t("readArticle")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )
        )}
      </div>
    </article>
  );
}

export const articleItemTitle: ItemTitle<"article"> = (view) =>
  view.article.title;
