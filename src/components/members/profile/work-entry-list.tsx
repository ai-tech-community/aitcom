import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import type { WorkEntry } from "./work-entries";

/**
 * Rows of a member's work: the title (a link when there is a page), what
 * kind of work it is when the list mixes kinds, a short detail, and the date.
 */
export async function WorkEntryList({
  entries,
  showKind = false,
}: {
  entries: readonly WorkEntry[];
  /** Name each row's kind, for a list that mixes them (Recent work). */
  showKind?: boolean;
}) {
  const [t, tStage, format] = await Promise.all([
    getTranslations("memberProfile.work"),
    getTranslations("launchpad.stage"),
    getFormatter(),
  ]);

  const detailLabel = (entry: WorkEntry): string | null => {
    const { detail } = entry;
    if (!detail) return null;
    if (detail.type === "stage") {
      return tStage.has(detail.stage) ? tStage(detail.stage) : null;
    }
    switch (detail.outcome) {
      case "winner":
        return t("certificateWinner");
      case "participant":
        return t("certificateParticipant");
      case "course":
        return t("certificateCourse");
    }
  };

  return (
    <ul className="divide-border divide-y">
      {entries.map((entry) => {
        const title = entry.title ?? t("hackathonUntitled");
        const meta = [
          showKind ? t(`kind.${entry.kind}`) : null,
          detailLabel(entry),
        ].filter(Boolean);
        return (
          <li
            key={entry.key}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <div className="min-w-0 space-y-0.5">
              {entry.href ? (
                <Link
                  href={entry.href}
                  className="hover:text-foreground focus-visible:ring-ring/50 block truncate rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
                >
                  {title}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium">{title}</p>
              )}
              {meta.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {meta.join(" · ")}
                </p>
              )}
            </div>
            {entry.date && (
              <time
                dateTime={entry.date}
                className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums"
              >
                {format.dateTime(new Date(entry.date), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
            )}
          </li>
        );
      })}
    </ul>
  );
}
