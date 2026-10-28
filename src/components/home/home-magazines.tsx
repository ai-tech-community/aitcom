import { Link } from "@/i18n/navigation";
import { issuePath } from "@/lib/magazines/paths";
import {
  issueNumberText,
  useIssueDateline,
} from "@/components/magazines/reading/issue-dateline";
import { useTranslations } from "next-intl";
import { IssueCoverArt } from "@/components/magazines/reading/issue-cover-card";
import { MoreLink } from "@/components/ui/more-link";
import { SectionLabel } from "@/components/ui/section-label";
import type { MagazineCard } from "@/server/magazines/reading";

/** One newest readable issue per magazine; visibility is resolved by the read model. */
export function HomeMagazines({
  magazines,
}: {
  magazines: readonly MagazineCard[];
}) {
  const t = useTranslations("homeDiscovery");
  if (!magazines.length) return null;
  return (
    <section
      aria-labelledby="home-magazines-title"
      className="px-6 py-10 sm:px-12"
    >
      <SectionLabel id="home-magazines-title" className="pb-4">
        {t("magazines")}
      </SectionLabel>
      <p className="text-muted-foreground mt-4 max-w-prose text-sm">
        {t("magazinesIntro")}
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4 lg:gap-x-8">
        {magazines.slice(0, 4).map((magazine) => (
          <li key={magazine.id} className="min-w-0">
            <HomeMagazineIssue magazine={magazine} />
            <p className="text-muted-foreground mt-2 text-xs break-words">
              {magazine.community.name}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-6 text-right">
        <MoreLink href="/magazines">{t("allMagazines")}</MoreLink>
      </div>
    </section>
  );
}

function HomeMagazineIssue({ magazine }: { magazine: MagazineCard }) {
  const issue = magazine.latest;
  const dateline = useIssueDateline(issue);
  return (
    <Link
      href={issuePath(issue.magazine, issue)}
      className="group focus-visible:ring-ring/50 flex min-w-0 flex-col gap-2 rounded-lg outline-none focus-visible:ring-[3px]"
    >
      {issue.coverImageUrl ? (
        <IssueCoverArt issue={issue} />
      ) : (
        <div
          aria-hidden="true"
          className="bg-secondary flex aspect-[3/4] w-full flex-col justify-between gap-3 overflow-hidden rounded-lg border p-3 sm:p-5"
        >
          <span className="text-muted-foreground font-mono text-xs">
            {issueNumberText(issue.number)}
          </span>
          <span className="flex flex-col gap-3">
            <span className="line-clamp-3 text-xl leading-tight font-semibold tracking-tight break-words sm:text-2xl">
              {magazine.name}
            </span>
            <span className="line-clamp-3 text-sm leading-snug break-words">
              {issue.title}
            </span>
          </span>
        </div>
      )}
      <span className="text-sm font-semibold break-words">{magazine.name}</span>
      <span className="text-muted-foreground font-mono text-xs">
        {dateline}
      </span>
      <span className="text-sm leading-snug break-words underline-offset-4 group-hover:underline">
        {issue.title}
      </span>
    </Link>
  );
}
