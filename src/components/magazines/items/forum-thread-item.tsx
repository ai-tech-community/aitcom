import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { ItemRow } from "./item-row";
import type { ItemRendererProps, ItemTitle } from "./types";

/** A live conversation, linked through its community's own forum. */
export function ForumThreadItem({
  view,
  size,
}: ItemRendererProps<"forumThread">) {
  const t = useTranslations("magazines.item");
  const { thread } = view;

  switch (size) {
    case "row":
      return (
        <ItemRow
          kind="forumThread"
          title={
            <Link
              href={thread.path as never}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {thread.title}
            </Link>
          }
          label={t("forumKind")}
          intro={view.intro}
          fact={t("replies", { count: thread.replyCount })}
        />
      );
    case "lead":
    case "card":
      break;
  }
  const isLead = size === "lead";

  return (
    <article
      data-item-kind="forumThread"
      className="bg-card text-card-foreground flex h-full flex-col overflow-hidden rounded-xl border"
    >
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 p-5",
          isLead && "gap-3 @xl:p-8",
        )}
      >
        <p className="text-muted-foreground text-sm">{t("forumKind")}</p>
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            isLead
              ? "text-2xl leading-tight @xl:text-3xl"
              : "text-lg leading-snug",
          )}
        >
          <Link
            href={thread.path as never}
            className="underline-offset-4 hover:underline focus-visible:underline"
          >
            {thread.title}
          </Link>
        </h2>
        {view.intro && <p className="text-sm">{view.intro}</p>}
        {thread.authorName && (
          <p className="text-muted-foreground text-sm">
            {t("byAuthor", { name: thread.authorName })}
          </p>
        )}
        <p className="text-muted-foreground font-mono text-xs">
          {t("replies", { count: thread.replyCount })}
        </p>
      </div>
    </article>
  );
}

export const forumThreadItemTitle: ItemTitle<"forumThread"> = (view) =>
  view.thread.title;
