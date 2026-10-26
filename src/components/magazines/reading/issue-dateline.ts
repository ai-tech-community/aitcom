import { useFormatter, useTranslations } from "next-intl";

import type { IssueCard } from "@/server/magazines/reading";

/** An issue number as every reading page shows it: two digits at least ("04"). */
export function issueNumberText(number: number): string {
  return String(number).padStart(2, "0");
}

/** "Issue 04 · November 2026"; a draft (no publish date) is "Issue 04". */
export function useIssueDateline(
  issue: Pick<IssueCard, "number" | "publishedAt">,
): string {
  const t = useTranslations("magazines.issue");
  const format = useFormatter();
  const number = issueNumberText(issue.number);
  if (!issue.publishedAt) return t("number", { number });
  return t("dateline", {
    number,
    month: format.dateTime(new Date(issue.publishedAt), {
      month: "long",
      year: "numeric",
    }),
  });
}
