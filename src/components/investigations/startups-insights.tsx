import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import {
  INSIGHT_FILL,
  MonthColumns,
  RankedBars,
  ShareBar,
  StepLegend,
} from "@/components/investigations/startups-insights-bars";
import { StartupLogo } from "@/components/investigations/startups-logo";
import { STARTUP_ROLES_PER_COMPANY_CAP } from "@/lib/investigations/startup-roles";
import {
  STARTUP_EXIT_STATUS_LABELS,
  STARTUP_EXIT_STATUS_IDS,
  STARTUPS_INSIGHTS_PATH,
  STARTUPS_JOBS_PATH,
  buildStartupDirectoryPath,
  buildStartupProfilePath,
  type StartupLocale,
} from "@/lib/investigations/startups";
import {
  startupInsightsShareLines,
  startupInsightsShareFacts,
  type StartupsInsightsStats,
} from "@/lib/investigations/startups-insights";

export type StartupsInsightsKey =
  | "insightsLedeCompanies"
  | "insightsLedeHiring"
  | "insightsLedeExits"
  | "whereTitle"
  | "whereTakeaway"
  | "whereOther"
  | "whereUnplaced"
  | "countryColumn"
  | "whatTitle"
  | "whatTakeaway"
  | "legendHiring"
  | "legendNotHiring"
  | "hiringInCategory"
  | "hiringTitle"
  | "hiringTakeaway"
  | "hiringCapNote"
  | "hiringSeeAll"
  | "hiringNone"
  | "roleBand"
  | "roleBandOpen"
  | "hiringTopTitle"
  | "sourcesTitle"
  | "sourcesTakeaway"
  | "sourcesBucket"
  | "exitsTitle"
  | "stageTitle"
  | "timelineTitle"
  | "notYetTitle"
  | "stageOmitted"
  | "timelineOmitted"
  | "countriesOmitted"
  | "categoryColumn"
  | "stageColumn"
  | "sourcesColumn"
  | "monthColumn"
  | "countColumn"
  | "sectionHiring"
  | "empty"
  | "emptyHelp"
  | "shareHero"
  | "shareSub"
  | "shareProofListed"
  | "shareProofHiring"
  | "shareProofMap"
  | "shareProofMapOnly"
  | "shareProofCategory"
  | "shareSeeInsights"
  | "shareOpenPositions"
  | "shareOgKicker"
  | "shareOgTitle"
  | "shareOgTitleNoHiring"
  | "shareOgDescription"
  | "shareOgDescriptionNoHiring";

export type StartupsInsightsT = (
  key: StartupsInsightsKey,
  values?: Record<string, string | number>,
) => string;

/**
 * Share card for the public Insights page. Proof lines and the counts in
 * them come from `startupInsightsShareFacts` (the same aggregate as the
 * charts). A line with nothing sourced is omitted.
 */
export function StartupsInsightsShareCard({
  stats,
  locale,
  t,
  shareUrl,
}: {
  stats: StartupsInsightsStats;
  locale: StartupLocale;
  t: StartupsInsightsT;
  /** Absolute www Insights URL. Rendered for share targets, never a Hub path. */
  shareUrl?: string;
}) {
  const facts = startupInsightsShareFacts(stats, locale);
  const lines = startupInsightsShareLines(facts);
  if (lines.length === 0) return null;

  return (
    <aside
      aria-labelledby="insights-share-hero"
      data-startups-insights-share=""
      data-insights-share-url={shareUrl}
      className="border-border bg-background max-w-3xl rounded-xl border p-6 sm:p-8"
    >
      <h2
        id="insights-share-hero"
        className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
      >
        {t("shareHero")}
      </h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-base leading-relaxed">
        {t("shareSub")}
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {lines.map((line) => (
          <li
            key={line.id}
            data-insights-share-proof={line.id}
            className="border-border rounded-lg border px-4 py-3 text-sm leading-relaxed"
          >
            {emphasizeNumbers(t(line.key, line.values))}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={STARTUPS_INSIGHTS_PATH}>{t("shareSeeInsights")}</Link>
        </Button>
        <span aria-hidden="true" className="text-muted-foreground text-sm">
          →
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href={STARTUPS_JOBS_PATH}>{t("shareOpenPositions")}</Link>
        </Button>
      </div>
    </aside>
  );
}

/**
 * Insights as a short read: one sentence of headline counts, then one
 * section per question (where, what, who is hiring, how well sourced).
 * Sections without data are listed under "Not shown yet" instead of
 * rendering empty panels.
 */
export function StartupsInsights({
  stats,
  locale,
  t,
}: {
  stats: StartupsInsightsStats;
  locale: StartupLocale;
  t: StartupsInsightsT;
}) {
  if (stats.total === 0) {
    return (
      <div data-startups-insights-empty="">
        <EmptyState title={t("empty")} description={t("emptyHelp")} />
      </div>
    );
  }

  const numbers = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US");
  const format = (value: number) => numbers.format(value);
  const exitCount = stats.exits.acquired + stats.exits.ipo;
  const notYet = [
    stats.countries ? null : t("countriesOmitted"),
    stats.stageMix ? null : t("stageOmitted"),
    stats.timeline ? null : t("timelineOmitted"),
  ].filter((item): item is string => item !== null);

  return (
    <div data-startups-insights="" className="flex flex-col gap-16">
      <p
        data-insights-lede=""
        className="text-muted-foreground max-w-4xl text-2xl leading-snug font-medium tracking-tight text-balance sm:text-3xl"
      >
        {emphasizeNumbers(
          [
            t("insightsLedeCompanies", {
              companies: stats.total,
              countries: stats.countryCount,
            }),
            stats.hiring.companies > 0
              ? t("insightsLedeHiring", {
                  companies: stats.hiring.companies,
                  roles: stats.hiring.roles,
                  capped: String(stats.hiring.rolesCapped),
                })
              : null,
            exitCount > 0 ? t("insightsLedeExits", { count: exitCount }) : null,
          ]
            .filter(Boolean)
            .join(" "),
        )}
      </p>

      {stats.timeline ? (
        <InsightSection id="timeline" title={t("timelineTitle")}>
          <MonthColumns
            caption={t("timelineTitle")}
            monthHeader={t("monthColumn")}
            valueHeader={t("countColumn")}
            rows={stats.timeline}
            format={format}
          />
        </InsightSection>
      ) : null}

      <div className="grid grid-cols-1 gap-x-16 gap-y-16 lg:grid-cols-2">
        {stats.countries ? (
          <InsightSection
            id="where"
            title={t("whereTitle")}
            takeaway={whereTakeaway(stats, t)}
            footnote={
              stats.countries.unplaced > 0
                ? t("whereUnplaced", { count: stats.countries.unplaced })
                : undefined
            }
          >
            <RankedBars
              caption={t("whereTitle")}
              labelHeader={t("countryColumn")}
              valueHeader={t("countColumn")}
              rows={[
                ...stats.countries.rows.map((row) => ({
                  key: row.country,
                  label: row.country,
                  value: row.count,
                  display: format(row.count),
                })),
                ...(stats.countries.other.countries > 0
                  ? [
                      {
                        key: "other",
                        label: (
                          <span className="text-muted-foreground">
                            {t("whereOther", {
                              countries: stats.countries.other.countries,
                            })}
                          </span>
                        ),
                        value: stats.countries.other.companies,
                        display: format(stats.countries.other.companies),
                        tone: "soft" as const,
                      },
                    ]
                  : []),
              ]}
            />
          </InsightSection>
        ) : null}

        <InsightSection
          id="what"
          title={t("whatTitle")}
          takeaway={
            stats.categories[0]
              ? t("whatTakeaway", {
                  category: stats.categories[0].label,
                  share: stats.hiring.companies / stats.total,
                })
              : undefined
          }
        >
          <StepLegend
            items={[
              { label: t("legendHiring"), fill: INSIGHT_FILL.strong },
              { label: t("legendNotHiring"), fill: INSIGHT_FILL.soft },
            ]}
          />
          <RankedBars
            caption={t("whatTitle")}
            labelHeader={t("categoryColumn")}
            valueHeader={t("countColumn")}
            labelWidth="w-24 sm:w-28"
            valueRoom="pr-28"
            rows={stats.categories.map((row) => ({
              key: row.id,
              label: (
                <Link
                  href={buildStartupDirectoryPath({ category: row.id })}
                  className="underline-offset-4 hover:underline"
                >
                  {row.label}
                </Link>
              ),
              value: row.count,
              emphasis: row.hiring,
              display: format(row.count),
              note:
                row.hiring > 0
                  ? t("hiringInCategory", { count: format(row.hiring) })
                  : undefined,
            }))}
          />
        </InsightSection>

        <InsightSection
          id="hiring"
          title={t("hiringTitle")}
          takeaway={
            stats.hiring.top.length > 0 ? t("hiringTakeaway") : undefined
          }
          footnote={
            stats.hiring.rolesCapped
              ? t("hiringCapNote", { cap: STARTUP_ROLES_PER_COMPANY_CAP })
              : undefined
          }
        >
          {stats.hiring.top.length > 0 ? (
            <>
              <RankedBars
                caption={t("hiringTitle")}
                labelHeader={t("sectionHiring")}
                valueHeader={t("countColumn")}
                labelWidth="w-24 sm:w-28"
                rows={stats.hiring.bands.map((band) => ({
                  key: String(band.min),
                  label:
                    band.max === null
                      ? t("roleBandOpen", { min: band.min })
                      : t("roleBand", { min: band.min, max: band.max }),
                  value: band.count,
                  display: format(band.count),
                }))}
              />
              <div className="flex flex-col gap-3">
                <h3 className="text-muted-foreground text-xs font-medium">
                  {t("hiringTopTitle")}
                </h3>
                <ul
                  data-insights-top-hiring=""
                  className="flex flex-wrap gap-2"
                >
                  {stats.hiring.top.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={buildStartupProfilePath(row.slug)}
                        className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors outline-none focus-visible:ring-[3px]"
                      >
                        <StartupLogo card={row} size="xs" />
                        <span>{row.name}</span>
                        <span className="text-muted-foreground font-mono text-xs tabular-nums">
                          {row.capped
                            ? `${format(row.roles)}+`
                            : format(row.roles)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href={STARTUPS_JOBS_PATH}
                className="w-fit text-sm font-medium underline-offset-4 hover:underline"
              >
                {t("hiringSeeAll")}
              </Link>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("hiringNone")}</p>
          )}
        </InsightSection>

        <InsightSection
          id="sources"
          title={t("sourcesTitle")}
          takeaway={t("sourcesTakeaway", {
            share: countOf(stats.sourceDepth, 3) / stats.total,
          })}
        >
          <ShareBar
            caption={t("sourcesTitle")}
            segments={([3, 2, 1] as const).map((sources) => {
              const count = countOf(stats.sourceDepth, sources);
              return {
                key: String(sources),
                label: t("sourcesBucket", { count: sources }),
                value: count,
                display: format(count),
                share: formatShare(count / stats.total, locale),
                fill:
                  sources === 3
                    ? INSIGHT_FILL.strong
                    : sources === 2
                      ? INSIGHT_FILL.mid
                      : INSIGHT_FILL.soft,
              };
            })}
          />
        </InsightSection>

        {exitCount + stats.exits.shutdown > 0 ? (
          <InsightSection id="exits" title={t("exitsTitle")}>
            <ul className="divide-border divide-y text-sm">
              {STARTUP_EXIT_STATUS_IDS.filter(
                (status) => stats.exits[status] > 0,
              ).map((status) => (
                <li key={status}>
                  <Link
                    href={buildStartupDirectoryPath({ status })}
                    className="hover:bg-muted/50 flex items-center justify-between gap-4 py-2.5 transition-colors"
                  >
                    <span className="underline-offset-4 hover:underline">
                      {STARTUP_EXIT_STATUS_LABELS[status][locale]}
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                      {format(stats.exits[status])}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </InsightSection>
        ) : null}

        {stats.stageMix ? (
          <InsightSection id="stage" title={t("stageTitle")}>
            <RankedBars
              caption={t("stageTitle")}
              labelHeader={t("stageColumn")}
              valueHeader={t("countColumn")}
              rows={stats.stageMix.map((row) => ({
                key: row.stage,
                label: row.stage,
                value: row.count,
                display: format(row.count),
              }))}
            />
          </InsightSection>
        ) : null}
      </div>

      {notYet.length > 0 ? (
        <aside
          data-insights-not-yet=""
          aria-labelledby="insight-not-yet"
          className="flex flex-col gap-3"
        >
          <SectionLabel as="h2" id="insight-not-yet">
            {t("notYetTitle")}
          </SectionLabel>
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            {notYet.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

function InsightSection({
  id,
  title,
  takeaway,
  footnote,
  children,
}: {
  id: string;
  title: string;
  takeaway?: string;
  footnote?: string;
  children: ReactNode;
}) {
  const headingId = `insight-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      data-startups-insight-tile={id}
      className="flex min-w-0 flex-col gap-5"
    >
      <SectionLabel as="h2" id={headingId}>
        {title}
      </SectionLabel>
      {takeaway ? (
        <p className="text-lg leading-snug font-medium tracking-tight text-balance">
          {takeaway}
        </p>
      ) : null}
      {children}
      {footnote ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {footnote}
        </p>
      ) : null}
    </section>
  );
}

function whereTakeaway(
  stats: StartupsInsightsStats,
  t: StartupsInsightsT,
): string | undefined {
  const countries = stats.countries;
  const [first, second] = countries?.rows ?? [];
  if (!countries || !first || !second) return undefined;
  const placed = stats.total - countries.unplaced;
  return t("whereTakeaway", {
    first: first.country,
    second: second.country,
    share: (first.count + second.count) / placed,
  });
}

function countOf(
  depth: StartupsInsightsStats["sourceDepth"],
  sources: 1 | 2 | 3,
): number {
  return depth.find((row) => row.sources === sources)?.count ?? 0;
}

/** Whole-percent share; a non-zero share under 0.5% reads "<1%", not "0%". */
function formatShare(share: number, locale: StartupLocale): string {
  const percent = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  });
  return share > 0 && share < 0.005
    ? `<${percent.format(0.01)}`
    : percent.format(share);
}

/** Headline counts read first: numbers in ink, words in muted text. */
function emphasizeNumbers(text: string): ReactNode[] {
  return text.split(/(\d[\d.,  ]*\d\+?|\d\+?)/).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="text-foreground font-semibold">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}
