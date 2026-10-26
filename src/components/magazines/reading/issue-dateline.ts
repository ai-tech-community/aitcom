import { useFormatter, useTranslations } from "next-intl";

import type { IssueCard } from "@/server/magazines/reading";

/** "Issue 04 · November 2026"; a draft (no publish date) is "Issue 04". */
export function useIssueDateline(
  issue: Pick<IssueCard, "number" | "publishedAt">,
): string {
  const t = useTranslations("magazines.issue");
  const format = useFormatter();
  const number = String(issue.number).padStart(2, "0");
  if (!issue.publishedAt) return t("number", { number });
  return t("dateline", {
    number,
    month: format.dateTime(new Date(issue.publishedAt), {
      month: "long",
      year: "numeric",
    }),
  });
}
