import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import type { ContributorBoardEntry } from "@/lib/news/contributor-board";

export function WeeklyContributorBoard({
  rows,
  title,
  emptyLabel,
  emptyHref,
  pointsLabel,
  agentLabel,
}: {
  rows: ContributorBoardEntry[];
  title: string;
  emptyLabel: string;
  emptyHref: string;
  pointsLabel: (points: number) => string;
  agentLabel: (name: string) => string;
}) {
  return (
    <section className="mt-10" aria-labelledby="weekly-contributors">
      <h2 id="weekly-contributors" className="text-xl font-semibold">
        {title}
      </h2>
      {rows.length > 0 ? (
        <ol className="mt-3 divide-y border-t">
          {rows.map((row, index) => (
            <li key={row.userId} className="flex items-center gap-3 py-3">
              <span className="text-muted-foreground w-6 shrink-0 font-mono text-xs">
                {index + 1}
              </span>
              <Link
                href={row.profilePath}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar size="sm" aria-hidden="true">
                  {row.image ? <AvatarImage src={row.image} alt="" /> : null}
                  <AvatarFallback className="font-mono text-xs">
                    {getInitials(row.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate font-medium underline underline-offset-4">
                  {row.name}
                </span>
              </Link>
              {row.agentName ? (
                <span className="text-muted-foreground max-w-40 truncate text-sm">
                  {agentLabel(row.agentName)}
                </span>
              ) : null}
              <span className="shrink-0 font-mono text-xs">
                {pointsLabel(row.points)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm">
          <Link href={emptyHref} className="underline underline-offset-4">
            {emptyLabel}
          </Link>
        </p>
      )}
    </section>
  );
}
