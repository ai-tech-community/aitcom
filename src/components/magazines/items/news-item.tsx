import { useLocale, useTranslations } from "next-intl";

import { formatEventDay } from "@/lib/event-time";
import { cn } from "@/lib/utils";

import { FactSeparator } from "./fact-separator";
import type { ItemRendererProps, ItemTitle } from "./types";

/** A compact headline linking to its original source. */
export function NewsItemCard({ view, lead }: ItemRendererProps<"newsItem">) {
  const t = useTranslations("magazines.item");
  const locale = useLocale();
  const { news } = view;

  return (
    <article
      data-item-kind="newsItem"
      className="bg-card text-card-foreground flex h-full flex-col overflow-hidden rounded-xl border"
    >
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 p-5",
          lead && "gap-3 @xl:p-8",
        )}
      >
        <p className="text-muted-foreground text-sm">{t("newsKind")}</p>
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            lead
              ? "text-2xl leading-tight @xl:text-3xl"
              : "text-lg leading-snug",
          )}
        >
          {news.url ? (
            <a
              href={news.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {news.title} <span className="sr-only">{t("opensInNewTab")}</span>
            </a>
          ) : (
            news.title
          )}
        </h2>
        {view.intro && <p className="text-sm">{view.intro}</p>}
        {(Boolean(news.source) || Boolean(news.publishedAt)) && (
          <p className="text-muted-foreground text-xs">
            {news.source && <span>{news.source}</span>}
            {news.source && news.publishedAt && <FactSeparator />}
            {news.publishedAt && (
              <span className="font-mono">
                {formatEventDay(news.publishedAt, locale)}
              </span>
            )}
          </p>
        )}
        {lead && news.summary && (
          <p className="text-muted-foreground leading-relaxed">
            {news.summary}
          </p>
        )}
      </div>
    </article>
  );
}

export const newsItemTitle: ItemTitle<"newsItem"> = (view) => view.news.title;
