import { newsGameRobots } from "@/lib/news/indexability";
import { absoluteLocaleUrl } from "@/lib/metadata";
import {
  NEWS_SECTORS,
  newsSectorCanonicalPath,
  newsSectorViewRobots,
  parseNewsSector,
} from "@/lib/news/sectors";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import dynamic from "next/dynamic";

import { NewsLogo } from "@/components/news/news-logo";
import { NewsRumorActions } from "@/components/news/news-rumor-actions";
import {
  NewsTableBrowser,
  type NewsFilterChip,
} from "@/components/news/news-table-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewsSection } from "@/components/news/news-section";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import {
  newsTableFacets,
  newsTableHref,
  newsTableWriter,
  buildNewsTableRows,
  parseNewsTableQuery,
  type NewsTableQuery,
  type NewsTableRow,
  type NewsTableSort,
} from "@/lib/news/table";
import { getSession } from "@/server/better-auth/server";
import { listNewsDirectoryCompanies } from "@/server/news/directory";
import { findNewsItem } from "@/server/news/list";
import { listNewsStartupLinks } from "@/server/news/startup-links";
import { isNewsStaff } from "@/server/news/staff";
import {
  queryNewsTablePage,
  type NewsTablePage,
} from "@/server/news/table-page";
import {
  sectorHasRealStories,
  sectorsWithRealFeeds,
} from "@/server/news/sectors";
const NewsRumorDialog = dynamic(() =>
  import("@/components/news/news-rumor-dialog").then(
    (mod) => mod.NewsRumorDialog,
  ),
);

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string | string[] }>;
}): Promise<Metadata> {
  const t = await getTranslations("newsPage");
  const params = await searchParams;
  const sector = parseNewsSector(params.sector);
  const base = {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: newsGameRobots(),
  };
  if (!sector) return base;
  const locale = await getLocale();
  const hasStories = await sectorHasRealStories(sector).catch(() => false);
  return {
    ...base,
    robots: newsSectorViewRobots(hasStories),
    alternates: {
      canonical: absoluteLocaleUrl(locale, newsSectorCanonicalPath()),
    },
  };
}

function formatWhen(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function SortHeader({
  label,
  sort,
  query,
  align = "left",
}: {
  label: string;
  sort: NewsTableSort;
  query: NewsTableQuery;
  align?: "left" | "right";
}) {
  const active = query.sort === sort;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort === "date" ? "descending" : "ascending") : undefined
      }
      className={`px-3 py-2 font-medium tracking-wider ${align === "right" ? "text-right" : "text-left"}`}
    >
      <Link
        href={newsTableHref(query, { sort, page: 1 })}
        rel="nofollow"
        className={active ? "text-foreground" : "hover:text-foreground"}
      >
        {label}
      </Link>
    </th>
  );
}

function CompanyMarks({ row }: { row: NewsTableRow }) {
  if (row.companies.length > 0) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
        {row.companies.slice(0, 4).map((company) => {
          const logo = <NewsLogo src={company.logoUrl} name={company.name} />;
          if (!company.profilePath) return <span key={company.id}>{logo}</span>;
          return (
            <Link
              key={company.id}
              href={company.profilePath}
              title={company.name}
              className="shrink-0"
            >
              {logo}
            </Link>
          );
        })}
      </div>
    );
  }
  return <NewsLogo src={row.fallbackLogo} name={row.sourceLabel} />;
}

function WriterName({
  row,
  query,
}: {
  row: NewsTableRow;
  query: NewsTableQuery;
}) {
  const writer = newsTableWriter(row.writer);
  if (!writer) return <span>{row.writer}</span>;
  return (
    <Link
      href={newsTableHref(query, { writer, page: 1 })}
      rel="nofollow"
      className="focus-visible:ring-ring rounded-sm underline-offset-4 hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {row.writer}
    </Link>
  );
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    story?: string | string[];
    q?: string | string[];
    type?: string | string[];
    source?: string | string[];
    company?: string | string[];
    writer?: string | string[];
    sort?: string | string[];
    page?: string | string[];
    sector?: string | string[];
  }>;
}) {
  const t = await getTranslations("newsPage");
  const sectorNames = await getTranslations("newsSectors");
  const locale = await getLocale();
  const params = await searchParams;
  const query = parseNewsTableQuery(params);
  const feedSectors = query.sector
    ? await sectorsWithRealFeeds().catch(() => new Set(["ai"] as const))
    : null;
  const sectorHasFeeds =
    !query.sector || (feedSectors?.has(query.sector) ?? false);
  const session = await getSession().catch(() => null);
  const staff = await isNewsStaff(session?.user?.email);
  const emptyPage: NewsTablePage = {
    stories: [],
    rumors: [],
    order: [],
    total: 0,
    page: 1,
    totalPages: 1,
    sources: [],
    writers: [],
    companies: [],
  };
  const [loaded, directory] = await Promise.all([
    sectorHasFeeds
      ? queryNewsTablePage({
          query,
          includeHiddenRumors: staff,
          memberSource: t("rumorLabel"),
        }).catch((err: unknown) => {
          console.error("news: could not query the table", err);
          return emptyPage;
        })
      : emptyPage,
    listNewsDirectoryCompanies().catch((err: unknown) => {
      console.error("news: could not list directory companies", err);
      return [];
    }),
  ]);
  let stories = loaded.stories;
  const rumors = loaded.rumors;
  let order = loaded.order;
  if (query.story && !stories.some((item) => item.id === query.story)) {
    const extra = await findNewsItem(query.story).catch((err: unknown) => {
      console.error("news: could not load the linked story", err);
      return null;
    });
    if (extra) {
      stories = [...stories, extra];
      order = [...order, { kind: "story", id: extra.id }];
    }
  }
  const links = await listNewsStartupLinks({
    itemIds: stories.map((item) => item.id),
    rumorIds: rumors.map((item) => item.id),
  }).catch((err: unknown) => {
    console.error("news: could not list startup links", err);
    return { stories: {}, rumors: {} };
  });
  const built = buildNewsTableRows(
    stories,
    rumors,
    directory,
    { memberSource: t("rumorLabel") },
    links,
  );
  const byKey = new Map(built.map((row) => [`${row.kind}:${row.id}`, row]));
  const items = order.flatMap((entry) => {
    const row = byKey.get(`${entry.kind}:${entry.id}`);
    return row ? [row] : [];
  });
  const detected = newsTableFacets(items);
  const companyNames = new Map(
    loaded.companies.map((company) => [company.id, company.name]),
  );
  for (const company of detected.companies) {
    companyNames.set(company.id, company.name);
  }
  const facetCompanies = [...companyNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const filtered =
    query.q !== "" ||
    query.type !== "all" ||
    query.source !== "" ||
    query.company !== "" ||
    query.writer !== "" ||
    query.sector !== "";
  const sources =
    query.source &&
    !loaded.sources.some((source) => source.key === query.source)
      ? [{ key: query.source, label: query.source }, ...loaded.sources]
      : loaded.sources;
  const companies =
    query.company &&
    !facetCompanies.some((company) => company.id === query.company)
      ? [{ id: query.company, name: query.company }, ...facetCompanies]
      : facetCompanies;
  const writers =
    query.writer && !loaded.writers.includes(query.writer)
      ? [query.writer, ...loaded.writers]
      : loaded.writers;
  const sourceLabel =
    sources.find((source) => source.key === query.source)?.label ??
    query.source;
  const companyLabel =
    companies.find((company) => company.id === query.company)?.name ??
    query.company;
  const typeLabel =
    query.type === "verified"
      ? t("typeVerified")
      : query.type === "rumor"
        ? t("typeRumor")
        : "";
  const chips: NewsFilterChip[] = [
    query.q
      ? {
          id: "q",
          label: query.q,
          clearLabel: t("clearSearch", { query: query.q }),
          href: newsTableHref(query, { q: "", page: 1 }),
        }
      : null,
    query.type !== "all"
      ? {
          id: "type",
          label: typeLabel,
          clearLabel: t("clearType", { name: typeLabel }),
          href: newsTableHref(query, { type: "all", page: 1 }),
        }
      : null,
    query.source
      ? {
          id: "source",
          label: sourceLabel,
          clearLabel: t("clearSource", { name: sourceLabel }),
          href: newsTableHref(query, { source: "", page: 1 }),
        }
      : null,
    query.company
      ? {
          id: "company",
          label: companyLabel,
          clearLabel: t("clearCompany", { name: companyLabel }),
          href: newsTableHref(query, { company: "", page: 1 }),
        }
      : null,
    query.writer
      ? {
          id: "writer",
          label: query.writer,
          clearLabel: t("clearWriter", { name: query.writer }),
          href: newsTableHref(query, { writer: "", page: 1 }),
        }
      : null,
    query.sector
      ? {
          id: "sector",
          label: sectorNames(query.sector),
          clearLabel: t("clearSector", {
            name: sectorNames(query.sector),
          }),
          href: newsTableHref(query, { sector: "", page: 1 }),
        }
      : null,
  ].flatMap((chip) => (chip ? [chip] : []));

  return (
    <NewsSection
      label={t("tabsLabel")}
      news={t("tabNews")}
      stories={t("tabStories")}
    >
      <SectionLabel>{t("kicker")}</SectionLabel>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-base leading-relaxed">
            {t("description")}
          </p>
        </div>
        <div className="shrink-0">
          {session?.user ? (
            <NewsRumorDialog
              label={t("formTitle")}
              description={t("formHelp")}
            />
          ) : (
            <Link
              href="/auth/signin"
              className="text-muted-foreground hover:text-foreground text-sm underline"
            >
              {t("signIn")}
            </Link>
          )}
        </div>
      </div>

      {items.length === 0 && loaded.total === 0 && !filtered ? (
        <p className="text-muted-foreground mt-8 text-sm">{t("empty")}</p>
      ) : (
        <NewsTableBrowser
          query={query}
          sources={sources.map((source) => ({
            value: source.key,
            label: source.label,
          }))}
          companies={companies.map((company) => ({
            value: company.id,
            label: company.name,
          }))}
          writers={writers.map((writer) => ({ value: writer, label: writer }))}
          sectors={NEWS_SECTORS.map((sector) => ({
            value: sector,
            label: sectorNames(sector),
          }))}
          resultCount={t("resultCount", { count: loaded.total })}
          loadingLabel={t("loadingResults")}
          filtersLabel={t("filtersLabel")}
          chips={chips}
          clearHref={newsTableHref(query, {
            q: "",
            type: "all",
            source: "",
            company: "",
            writer: "",
            sector: "",
            page: 1,
          })}
          filtered={filtered}
          clearLabel={t("clear")}
          applyLabel={t("apply")}
          labels={{
            search: t("searchLabel"),
            searchPlaceholder: t("searchPlaceholder"),
            type: t("typeLabel"),
            typeAll: t("typeAll"),
            typeVerified: t("typeVerified"),
            typeRumor: t("typeRumor"),
            source: t("sourceLabel"),
            sourceAll: t("sourceAll"),
            company: t("companyLabel"),
            companyAll: t("companyAll"),
            writer: t("writerLabel"),
            writerAll: t("writerAll"),
            sector: t("sectorLabel"),
            sectorAll: t("sectorAll"),
            sort: t("sortLabel"),
            sortDate: t("sortDate"),
            sortTitle: t("sortTitle"),
            sortSource: t("sortSource"),
          }}
        >
          {items.length === 0 ? (
            <div className="mt-4">
              <p className="text-muted-foreground text-sm">
                {query.sector && !sectorHasFeeds
                  ? t("sectorEmpty", { sector: sectorNames(query.sector) })
                  : t("noMatches")}
              </p>
              <Button asChild variant="outline" className="mt-3">
                <Link
                  href={newsTableHref(query, {
                    q: "",
                    type: "all",
                    source: "",
                    company: "",
                    writer: "",
                    sector: "",
                    page: 1,
                  })}
                  rel="nofollow"
                >
                  {t("clear")}
                </Link>
              </Button>
            </div>
          ) : (
            <table className="mt-4 w-full text-sm">
              <caption className="sr-only">{t("tableCaption")}</caption>
              <thead className="text-muted-foreground hidden font-mono text-xs uppercase md:table-header-group">
                <tr className="border-border border-b">
                  <th
                    scope="col"
                    className="px-3 py-2 text-left font-medium tracking-wider"
                  >
                    {t("columnCompany")}
                  </th>
                  <SortHeader
                    label={t("columnTitle")}
                    sort="title"
                    query={query}
                  />
                  <th
                    scope="col"
                    className="px-3 py-2 text-left font-medium tracking-wider"
                  >
                    {t("columnWriter")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left font-medium tracking-wider"
                  >
                    {t("columnType")}
                  </th>
                  <SortHeader
                    label={t("columnDate")}
                    sort="date"
                    query={query}
                  />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const linked = row.kind === "story" && row.id === query.story;
                  return (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      id={
                        row.kind === "story"
                          ? `news-${row.id}`
                          : `rumor-${row.id}`
                      }
                      className={`border-border hover:bg-muted/40 focus-within:bg-muted/40 block border-b py-4 md:table-row md:py-0 ${linked ? "bg-muted/40" : ""}`}
                    >
                      <td className="grid grid-cols-[7rem_1fr] items-center gap-3 px-0 py-1 md:table-cell md:w-28 md:px-3 md:py-3">
                        <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase md:hidden">
                          {t("columnCompany")}
                        </span>
                        <CompanyMarks row={row} />
                      </td>
                      <td className="grid grid-cols-[7rem_1fr] items-start gap-3 px-0 py-1 md:table-cell md:px-3 md:py-3">
                        <span className="text-muted-foreground pt-0.5 font-mono text-xs tracking-wider uppercase md:hidden">
                          {t("columnTitle")}
                        </span>
                        <div className="min-w-0">
                          {row.href ? (
                            <a
                              href={row.href}
                              rel="noopener noreferrer"
                              className="text-foreground font-semibold underline-offset-4 hover:underline"
                            >
                              {row.title}
                            </a>
                          ) : (
                            <p className="text-foreground font-semibold">
                              {row.title}
                            </p>
                          )}
                          {row.blurb ? (
                            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                              {row.blurb}
                            </p>
                          ) : null}
                          {staff && row.kind === "rumor" ? (
                            <NewsRumorActions id={row.id} hidden={row.hidden} />
                          ) : null}
                        </div>
                      </td>
                      <td className="grid grid-cols-[7rem_1fr] items-center gap-3 px-0 py-1 md:table-cell md:px-3 md:py-3">
                        <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase md:hidden">
                          {t("columnWriter")}
                        </span>
                        <WriterName row={row} query={query} />
                      </td>
                      <td className="grid grid-cols-[7rem_1fr] items-center gap-3 px-0 py-1 md:table-cell md:px-3 md:py-3">
                        <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase md:hidden">
                          {t("columnType")}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          {row.kind === "story" ? (
                            <Badge variant="success">{t("verified")}</Badge>
                          ) : (
                            <Badge variant="warning">
                              {t("unverifiedRumor")}
                            </Badge>
                          )}
                          {row.hidden ? (
                            <Badge variant="outline">{t("hidden")}</Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="grid grid-cols-[7rem_1fr] items-center gap-3 px-0 py-1 md:table-cell md:px-3 md:py-3">
                        <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase md:hidden">
                          {t("columnDate")}
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {row.at != null
                            ? formatWhen(new Date(row.at), locale)
                            : t("undated")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {loaded.total > 0 ? (
            <nav
              className="mt-4 flex items-center justify-between gap-3"
              aria-label={t("pagination")}
            >
              {loaded.page > 1 ? (
                <Link
                  href={newsTableHref(query, { page: loaded.page - 1 })}
                  rel="nofollow"
                  className="text-foreground text-sm underline-offset-4 hover:underline"
                >
                  {t("previous")}
                </Link>
              ) : (
                <span className="text-muted-foreground text-sm">
                  {t("previous")}
                </span>
              )}
              <p className="text-muted-foreground font-mono text-xs">
                {t("pageOf", { page: loaded.page, total: loaded.totalPages })}
              </p>
              {loaded.page < loaded.totalPages ? (
                <Link
                  href={newsTableHref(query, { page: loaded.page + 1 })}
                  rel="nofollow"
                  className="text-foreground text-sm underline-offset-4 hover:underline"
                >
                  {t("next")}
                </Link>
              ) : (
                <span className="text-muted-foreground text-sm">
                  {t("next")}
                </span>
              )}
            </nav>
          ) : null}
        </NewsTableBrowser>
      )}
    </NewsSection>
  );
}
