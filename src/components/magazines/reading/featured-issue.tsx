import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { issuePath } from "@/lib/magazines/paths";
import type { IssueCard } from "@/server/magazines/reading";

import { IssueCoverArt } from "./issue-cover-card";
import { useIssueDateline } from "./issue-dateline";

/** The community masthead already names the publication and its community. */
export function FeaturedIssue({
  issue,
  labelId,
  label,
  variant = "home",
}: {
  issue: IssueCard;
  /** The id of the label that names the section. */
  labelId: string;
  /** The section label; "Featured issue" when not given. */
  label?: string;
  variant?: "home" | "community";
}) {
  const t = useTranslations("magazines");
  const dateline = useIssueDateline(issue);
  const community = variant === "community";
  return (
    <div className="bg-card text-card-foreground @container rounded-xl border">
      <div
        className={
          community
            ? "grid items-center gap-4 p-4 @xs:grid-cols-[minmax(0,1fr)_minmax(5rem,24%)] @lg:gap-7 @lg:p-6 @2xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] @2xl:gap-8"
            : "grid gap-6 p-5 @xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @xl:p-6"
        }
      >
        {/* The button below is the one way in for keyboards and screen readers. */}
        <Link
          href={issuePath(issue.magazine, issue)}
          tabIndex={-1}
          aria-hidden="true"
          className={
            community
              ? "order-last block w-full max-w-28 @xs:max-w-none @2xl:order-first"
              : "block w-full max-w-60 @xl:max-w-none"
          }
        >
          <IssueCoverArt issue={issue} />
        </Link>
        <div className="flex min-w-0 flex-col gap-4">
          <SectionLabel as="p" id={labelId} bordered={!community}>
            {label ?? t("home.featured")}
          </SectionLabel>
          <div className="flex flex-col gap-2">
            {!community && (
              <p className="text-sm font-semibold">{issue.magazine.name}</p>
            )}
            <p className="text-muted-foreground font-mono text-xs">
              {dateline}
            </p>
            <h2
              className={
                community
                  ? "font-[family-name:var(--magazine-serif,Georgia,serif)] text-3xl leading-[1.1] font-medium tracking-tight text-balance break-words @xl:text-4xl"
                  : "text-2xl leading-tight font-semibold tracking-tight text-balance break-words @xl:text-3xl"
              }
            >
              {issue.title}
            </h2>
            {!community && (
              <p className="text-muted-foreground text-sm">
                {t("home.fromCommunity", { community: issue.community.name })}
              </p>
            )}
          </div>
          <Button
            asChild
            variant={community ? "ink" : "default"}
            className="self-start"
          >
            <Link href={issuePath(issue.magazine, issue)}>
              {t("home.readIssue")}
              {community && <ArrowRight aria-hidden="true" />}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
