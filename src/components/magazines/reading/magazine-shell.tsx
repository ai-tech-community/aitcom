import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { issuePath, magazinePath } from "@/lib/magazines/paths";
import {
  MAGAZINE_FONT_OPTIONS,
  resolveMagazineFont,
} from "@/lib/magazines/typography";
import type {
  IssueCard,
  MagazineSummary,
  ReadingCommunity,
} from "@/server/magazines/reading";

export function MagazineShell({
  magazine,
  community,
  issue,
  children,
}: {
  magazine: MagazineSummary;
  community: ReadingCommunity;
  issue: Pick<IssueCard, "slug">;
  children: ReactNode;
}) {
  const t = useTranslations("magazines.shell");
  const font = resolveMagazineFont(magazine.font);
  const style = {
    "--magazine-display": MAGAZINE_FONT_OPTIONS[font].family,
  } as CSSProperties;
  return (
    <div className="magazine-publication" data-font={font} style={style}>
      <header className="magazine-nav">
        <Link href={`/communities/${community.slug}`} className="magazine-back">
          <ArrowLeft aria-hidden="true" />
          {t("backToCommunity")}
        </Link>
        <Link href={magazinePath(magazine)} className="magazine-wordmark">
          {magazine.name}
        </Link>
        <Link
          href={`${issuePath(magazine, issue)}#issue-contents`}
          className="magazine-contents-link"
        >
          <span>{t("contents")}</span>
          <List aria-hidden="true" />
        </Link>
      </header>
      {children}
      <footer className="magazine-footer">
        <span className="magazine-display">{magazine.name}</span>
        <Link href={`/communities/${community.slug}`}>
          {t("byCommunity", { community: community.name })}
        </Link>
        <Link href={magazinePath(magazine)}>{t("allIssues")}</Link>
      </footer>
    </div>
  );
}
