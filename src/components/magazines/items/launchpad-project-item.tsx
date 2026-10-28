import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { ItemRow } from "./item-row";
import type { ItemRendererProps, ItemTitle } from "./types";

/** A live project with a plain-text pitch and its current stage. */
export function LaunchpadProjectItem({
  view,
  size,
}: ItemRendererProps<"launchpadProject">) {
  const t = useTranslations("magazines.item");
  const stage = useTranslations("launchpad.stage");
  const { project } = view;
  switch (size) {
    case "row":
      return (
        <ItemRow
          kind="launchpadProject"
          title={
            <Link
              href={`/launchpad/${project.slug}`}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {project.title}
            </Link>
          }
          label={t("projectKind")}
          intro={view.intro}
          fact={t("upvotes", { count: project.voteCount })}
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
      data-item-kind="launchpadProject"
      className="bg-card text-card-foreground flex h-full flex-col overflow-hidden rounded-xl border"
    >
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 p-5",
          isLead && "gap-3 @xl:p-8",
        )}
      >
        <p className="text-muted-foreground text-sm">{t("projectKind")}</p>
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            isLead
              ? "text-2xl leading-tight @xl:text-3xl"
              : "text-lg leading-snug",
          )}
        >
          <Link
            href={`/launchpad/${project.slug}`}
            className="underline-offset-4 hover:underline focus-visible:underline"
          >
            {project.title}
          </Link>
        </h2>
        {view.intro && <p className="text-sm">{view.intro}</p>}
        <p className="text-muted-foreground text-sm">{stage(project.stage)}</p>
        <p className={cn("text-sm", !isLead && "line-clamp-3")}>
          {project.pitch}
        </p>
        {project.authorName && (
          <p className="text-muted-foreground text-sm">
            {t("byAuthor", { name: project.authorName })}
          </p>
        )}
        <p className="text-muted-foreground font-mono text-xs">
          {t("upvotes", { count: project.voteCount })}
        </p>
      </div>
    </article>
  );
}

export const launchpadProjectItemTitle: ItemTitle<"launchpadProject"> = (
  view,
) => view.project.title;
