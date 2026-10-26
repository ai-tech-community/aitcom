import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { magazinePath } from "@/lib/magazines/paths";
import type {
  IssueCard,
  MagazineSummary,
  ReadingCommunity,
} from "@/server/magazines/reading";

import { CopyLinkButton } from "./copy-link-button";
import { IssueCoverCard } from "./issue-cover-card";

/**
 * The issue page's side rail: about the magazine with a link to its
 * community, up to three past issues, and sharing (copy link only in
 * slice 1; subscribing comes with slice 2).
 */
export function IssueRail({
  magazine,
  community,
  pastIssues,
}: {
  magazine: MagazineSummary;
  community: ReadingCommunity;
  pastIssues: IssueCard[];
}) {
  const t = useTranslations("magazines.rail");
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionLabel>{magazine.name}</SectionLabel>
        {magazine.description && (
          <p className="text-sm leading-relaxed">{magazine.description}</p>
        )}
        <Button variant="ink" size="sm" asChild className="self-start">
          <Link href={`/communities/${community.slug}`}>
            {t("visitCommunity", { community: community.name })}
          </Link>
        </Button>
      </section>

      {pastIssues.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>{t("pastIssues")}</SectionLabel>
          <ul className="grid grid-cols-3 gap-3">
            {pastIssues.map((issue) => (
              <li key={issue.id} className="min-w-0">
                <IssueCoverCard issue={issue} />
              </li>
            ))}
          </ul>
          <Link
            href={magazinePath(magazine)}
            className="inline-flex items-center gap-1.5 self-start text-sm font-medium underline-offset-4 hover:underline"
          >
            {t("allIssues")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionLabel>{t("share")}</SectionLabel>
        <CopyLinkButton />
      </section>
    </div>
  );
}
