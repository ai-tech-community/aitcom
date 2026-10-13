import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { NewsLogo } from "@/components/news/news-logo";
import { NewsRumorActions } from "@/components/news/news-rumor-actions";
import { NewsRumorDialog } from "@/components/news/news-rumor-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import {
  newsTableFacets,
  newsTableHref,
  newsTableWriter,
  NEWS_TABLE_SCAN,
  applyNewsTableQuery,
  buildNewsTableRows,
  parseNewsTableQuery,
  type NewsTableQuery,
  type NewsTableRow,
  type NewsTableSort,
} from "@/lib/news/table";
import { getSession } from "@/server/better-auth/server";
import { listNewsDirectoryCompanies } from "@/server/news/directory";
import { listNewsStartupLinks } from "@/server/news/startup-links";
import {
  findNewsItem,
  listNewsItems,
  type NewsListItem,
} from "@/server/news/list";
import { listNewsRumors, type NewsRumorItem } from "@/server/news/rumors";
import { isNewsStaff } from "@/server/news/staff";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: true },
  };
}

function formatWhen(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

const fieldClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

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
      className="underline-offset-4 hover:underline"
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
  }>;
}) {
  const t = await getTranslations("newsPage");
  const locale = await getLocale();
  const params = await searchParams;
  const query = parseNewsTableQuery(params);
  const session = await getSession().catch(() => null);
  const staff = await isNewsStaff(session?.user?.email);
  const [listed, rumors, directory] = await Promise.all([
    listNewsItems(NEWS_TABLE_SCAN).catch((err: unknown) => {
      console.error("news: could not list stories", err);
      return [] as NewsListItem[];
    }),
    listNewsRumors({ includeHidden: staff }).catch((err: unknown) => {
      console.error("news: could not list rumors", err);
      return [] as NewsRumorItem[];
    }),
    listNewsDirectoryCompanies().catch((err: unknown) => {
      console.error("news: could not list directory companies", err);
      return [];
    }),
  ]);
  const missing =
    query.story.length > 0 && !listed.some((item) => item.id === query.story);
  const extra = missing
    ? await findNewsItem(query.story).catch((err: unknown) => {
        console.error("news: could not load the linked story", err);
        return null;
      })
    : null;
  const stories = extra ? [extra, ...listed] : listed;
  const links = await listNewsStartupLinks({
    itemIds: stories.map((item) => item.id),
    rumorIds: rumors.map((item) => item.id),
  }).catch((err: unknown) => {
    console.error("news: could not list startup links", err);
    return { stories: {}, rumors: {} };
  });
  const rows = buildNewsTableRows(
    stories,
    rumors,
    directory,
    { memberSource: t("rumorLabel") },
    links,
  );
  const facets = newsTableFacets(rows);
  const result = applyNewsTableQuery(rows, query);
  const filtered =
    query.q !== "" ||
    query.type !== "all" ||
    query.source !== "" ||
    query.company !== "" ||
    query.writer !== "";
  const sources =
    query.source &&
    !facets.sources.some((source) => source.key === query.source)
      ? [{ key: query.source, label: query.source }, ...facets.sources]
      : facets.sources;
  const companies =
    query.company &&
    !facets.companies.some((company) => company.id === query.company)
      ? [{ id: query.company, name: query.company }, ...facets.companies]
      : facets.companies;
  const writers =
    query.writer && !facets.writers.includes(query.writer)
      ? [query.writer, ...facets.writers]
      : facets.writers;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
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

      {rows.length === 0 && !filtered ? (
        <p className="text-muted-foreground mt-8 text-sm">{t("empty")}</p>
      ) : (
        <>
          <form
            method="get"
            className="mt-8 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
          >
            {query.story ? (
              <input type="hidden" name="story" value={query.story} />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:min-w-56">
              <label
                htmlFor="news-q"
                className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
              >
                {t("searchLabel")}
              </label>
              <Input
                id="news-q"
                name="q"
                defaultValue={query.q}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-44">
              <label
                htmlFor="news-type"
                className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
              >
                {t("typeLabel")}
              </label>
              <select
                id="news-type"
                name="type"
                defaultValue={query.type}
                className={fieldClass}
              >
                <option value="all">{t("typeAll")}</option>
                <option value="verified">{t("typeVerified")}</option>
                <option value="rumor">{t("typeRumor")}</option>
              </select>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-44">
              <label
                htmlFor="news-source"
                className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
              >
                {t("sourceLabel")}
              </label>
              <select
                id="news-source"
                name="source"
                defaultValue={query.source}
                className={fieldClass}
              >
                <option value="">{t("sourceAll")}</option>
                {sources.map((source) => (
                  <option key={source.key} value={source.key}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-44">
              <label
                htmlFor="news-company"
                className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
              >
                {t("companyLabel")}
              </label>
              <select
                id="news-company"
                name="company"
                defaultValue={query.company}
                className={fieldClass}
              >
                <option value="">{t("companyAll")}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-44">
              <label
                htmlFor="news-writer"
                className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
              >
                {t("writerLabel")}
              </label>
              <select
                id="news-writer"
                name="writer"
                defaultValue={query.writer}
                className={fieldClass}
              >
                <option value="">{t("writerAll")}</option>
                {writers.map((writer) => (
                  <option key={writer} value={writer}>
                    {writer}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-44">
              <label
                htmlFor="news-sort"
                className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
              >
                {t("sortLabel")}
              </label>
              <select
                id="news-sort"
                name="sort"
                defaultValue={query.sort}
                className={fieldClass}
              >
                <option value="date">{t("sortDate")}</option>
                <option value="title">{t("sortTitle")}</option>
                <option value="source">{t("sortSource")}</option>
              </select>
            </div>
            <Button type="submit" variant="outline">
              {t("apply")}
            </Button>
            {filtered ? (
              <Link
                href={newsTableHref(query, {
                  q: "",
                  type: "all",
                  source: "",
                  company: "",
                  writer: "",
                  page: 1,
                })}
                rel="nofollow"
                className="text-muted-foreground hover:text-foreground pb-2 text-sm underline"
              >
                {t("clear")}
              </Link>
            ) : null}
          </form>

          {query.writer ? (
            <div className="mt-3">
              <Badge
                variant="outline"
                className="gap-1 px-2 py-1 font-sans text-sm font-normal"
              >
                {query.writer}
                <Link
                  href={newsTableHref(query, { writer: "", page: 1 })}
                  rel="nofollow"
                  aria-label={t("clearWriter", { name: query.writer })}
                  className="text-muted-foreground hover:text-foreground -my-1 inline-flex size-5 items-center justify-center"
                >
                  <span aria-hidden="true">×</span>
                </Link>
              </Badge>
            </div>
          ) : null}

          <p className="text-muted-foreground mt-4 font-mono text-xs">
            {t("resultCount", { count: result.total })}
          </p>

          {result.items.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              {t("noMatches")}
            </p>
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
                {result.items.map((row) => {
                  const linked = row.kind === "story" && row.id === query.story;
                  return (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      id={
                        row.kind === "story"
                          ? `news-${row.id}`
                          : `rumor-${row.id}`
                      }
                      className={`border-border block border-b py-4 md:table-row md:py-0 ${linked ? "bg-muted/40" : ""}`}
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

          {result.total > 0 ? (
            <nav
              className="mt-4 flex items-center justify-between gap-3"
              aria-label={t("pagination")}
            >
              {result.page > 1 ? (
                <Link
                  href={newsTableHref(query, { page: result.page - 1 })}
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
                {t("pageOf", { page: result.page, total: result.totalPages })}
              </p>
              {result.page < result.totalPages ? (
                <Link
                  href={newsTableHref(query, { page: result.page + 1 })}
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
        </>
      )}
    </main>
  );
}
