import { Link } from "@/i18n/navigation";
import {
  awesomeDirectoryPageNumbers,
  buildAwesomeDirectoryPath,
  type AwesomeDirectoryQuery,
} from "@/lib/investigations/awesome-ai-oss";

export function AwesomeAiOssPagination({
  query,
  totalPages,
  signedIn,
  prevLabel,
  nextLabel,
  navLabel,
}: {
  query: AwesomeDirectoryQuery;
  totalPages: number;
  signedIn: boolean;
  prevLabel: string;
  nextLabel: string;
  navLabel: string;
}) {
  if (totalPages <= 1) return null;

  const pages = awesomeDirectoryPageNumbers(query.page, totalPages);
  const hrefFor = (page: number) =>
    buildAwesomeDirectoryPath({ ...query, page }, { signedIn });

  const linkBase =
    "font-mono text-xs tracking-wider rounded border px-3 py-1.5 transition-colors";
  const inactive = "border-border text-muted-foreground hover:bg-secondary/40";
  const active = "border-foreground bg-foreground text-background";
  const disabled =
    "border-border text-muted-foreground/40 pointer-events-none cursor-default";

  return (
    <nav
      aria-label={navLabel}
      className="mt-2 flex flex-wrap items-center justify-center gap-1.5"
    >
      {query.page > 1 ? (
        <Link
          href={hrefFor(query.page - 1)}
          className={`${linkBase} ${inactive}`}
        >
          ← {prevLabel}
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>← {prevLabel}</span>
      )}

      {pages.map((item, index) =>
        item === "gap" ? (
          <span
            key={`gap-${index}`}
            className="text-muted-foreground font-mono text-xs tracking-wider"
          >
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-current={item === query.page ? "page" : undefined}
            className={`${linkBase} ${item === query.page ? active : inactive}`}
          >
            {item}
          </Link>
        ),
      )}

      {query.page < totalPages ? (
        <Link
          href={hrefFor(query.page + 1)}
          className={`${linkBase} ${inactive}`}
        >
          {nextLabel} →
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>{nextLabel} →</span>
      )}
    </nav>
  );
}
