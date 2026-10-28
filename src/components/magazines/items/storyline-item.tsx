import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { formatEventDay } from "@/lib/event-time";
import { cn } from "@/lib/utils";

import { FactSeparator } from "./fact-separator";
import { ItemRow } from "./item-row";
import type { ItemRendererProps, ItemTitle } from "./types";

/** An AIT News story that keeps following its live source. */
export function StorylineItem({ view, size }: ItemRendererProps<"storyline">) {
  const t = useTranslations("magazines.item");
  const locale = useLocale();
  const { storyline } = view;
  const url = `/news/stories/${storyline.slug}`;

  switch (size) {
    case "row":
      return (
        <ItemRow
          kind="storyline"
          title={
            <Link
              href={url}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {storyline.title}
            </Link>
          }
          label={t("storylineKind")}
          intro={view.intro}
          fact={t("sources", { count: storyline.sourceCount })}
        />
      );
    case "lead":
    case "card":
      break;
  }
  const isLead = size === "lead";

  return (
    <article
      data-item-kind="storyline"
      className="bg-card text-card-foreground flex h-full flex-col overflow-hidden rounded-xl border"
    >
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 p-5",
          isLead && "gap-3 @xl:p-8",
        )}
      >
        <p className="text-muted-foreground text-sm">{t("storylineKind")}</p>
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            isLead
              ? "text-2xl leading-tight @xl:text-3xl"
              : "text-lg leading-snug",
          )}
        >
          <Link
            href={url}
            className="underline-offset-4 hover:underline focus-visible:underline"
          >
            {storyline.title}
          </Link>
        </h2>
        {view.intro && <p className="text-sm">{view.intro}</p>}
        <p
          className={cn(
            "text-muted-foreground leading-relaxed",
            !isLead && "line-clamp-3",
          )}
        >
          {storyline.overview}
        </p>
        <p className="text-muted-foreground font-mono text-xs">
          <span>{t("sources", { count: storyline.sourceCount })}</span>
          {storyline.updatedAt && (
            <>
              <FactSeparator />
              <span>
                {t("updated", {
                  date: formatEventDay(storyline.updatedAt, locale),
                })}
              </span>
            </>
          )}
        </p>
        {isLead && (
          <Link
            href={url}
            className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:underline"
          >
            {t("readStory")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
    </article>
  );
}

export const storylineItemTitle: ItemTitle<"storyline"> = (view) =>
  view.storyline.title;
