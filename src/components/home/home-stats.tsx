import { useTranslations } from "next-intl";

export interface HomeStatCounts {
  communities: number;
  /** Public roster profiles only, not every member (see `publicRosterVisibility`). */
  profiles: number;
  events: number;
  workshops: number;
  hackathons: number;
  sponsors: number;
}

const ORDER = [
  "communities",
  "profiles",
  "events",
  "workshops",
  "hackathons",
  "sponsors",
] as const satisfies readonly (keyof HomeStatCounts)[];

/**
 * The homepage stats ticker: real counts under translated labels
 * (`homeStats.*`). Mono is right here — these are stats, the machine voice.
 */
export function HomeStats({ counts }: { counts: HomeStatCounts }) {
  const t = useTranslations("homeStats");
  return (
    <dl
      data-testid="home-stats"
      className="border-border grid grid-cols-2 gap-y-1 border-y px-4 py-3 sm:flex sm:items-center sm:gap-y-0 sm:overflow-x-auto sm:px-0 sm:py-2.5"
    >
      {ORDER.map((key) => (
        <div
          key={key}
          className="flex items-center gap-1.5 px-3 py-1 sm:gap-2 sm:px-6 sm:py-0"
        >
          <dt className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            {t(key)}:
          </dt>
          <dd className="text-foreground font-mono text-xs font-semibold tracking-wider">
            {counts[key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
