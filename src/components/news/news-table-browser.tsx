"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useRouter } from "@/i18n/navigation";
import {
  newsTableHref,
  parseNewsTableQuery,
  type NewsTableQuery,
  type NewsTableSort,
} from "@/lib/news/table-query";

const SEARCH_DEBOUNCE_MS = 300;

const fieldClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export type NewsFilterChip = {
  id: string;
  label: string;
  clearLabel: string;
  href: string;
};

type Option = { value: string; label: string };

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

function newsHrefFromAnchor(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, "http://localhost");
  } catch {
    return null;
  }
  const path = url.pathname.replace(/^\/(en|nl)(?=\/|$)/, "") || "/";
  if (path !== "/news") return null;
  return `${path}${url.search}`;
}

function NewsTableSkeleton() {
  return (
    <div className="mt-4 flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-5 shrink-0 rounded-sm" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function NewsTableBrowser({
  query,
  sources,
  companies,
  writers,
  resultCount,
  loadingLabel,
  filtersLabel,
  chips,
  clearHref,
  filtered,
  clearLabel,
  applyLabel,
  labels,
  children,
}: {
  query: NewsTableQuery;
  sources: Option[];
  companies: Option[];
  writers: Option[];
  resultCount: string;
  loadingLabel: string;
  filtersLabel: string;
  chips: NewsFilterChip[];
  clearHref: string;
  filtered: boolean;
  clearLabel: string;
  applyLabel: string;
  labels: {
    search: string;
    searchPlaceholder: string;
    type: string;
    typeAll: string;
    typeVerified: string;
    typeRumor: string;
    source: string;
    sourceAll: string;
    company: string;
    companyAll: string;
    writer: string;
    writerAll: string;
    sort: string;
    sortDate: string;
    sortTitle: string;
    sortSource: string;
  };
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.q);
  const queryRef = useRef(query);
  const timer = useRef<number | null>(null);
  queryRef.current = query;

  useEffect(() => {
    if (
      typeof document !== "undefined" &&
      document.activeElement?.id === "news-q"
    ) {
      return;
    }
    setSearch(query.q);
  }, [query.q]);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  function go(href: string) {
    if (timer.current != null) window.clearTimeout(timer.current);
    startTransition(() => {
      router.push(href);
    });
  }

  function onSearch(value: string) {
    setSearch(value);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      go(newsTableHref(queryRef.current, { q: value, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
  }

  function onSelect(
    key: "type" | "source" | "company" | "writer" | "sort",
    value: string,
  ) {
    go(
      newsTableHref(query, {
        [key]: value,
        page: 1,
      }),
    );
  }

  return (
    <>
      <form
        method="get"
        className="mt-8 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = parseNewsTableQuery({
            q: search,
            type: formText(data, "type"),
            source: formText(data, "source"),
            company: formText(data, "company"),
            writer: formText(data, "writer"),
            sort: formText(data, "sort"),
            story: query.story,
            page: 1,
          });
          go(newsTableHref(next));
        }}
      >
        {query.story ? (
          <input type="hidden" name="story" value={query.story} />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:min-w-56">
          <label
            htmlFor="news-q"
            className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
          >
            {labels.search}
          </label>
          <Input
            id="news-q"
            name="q"
            value={search}
            placeholder={labels.searchPlaceholder}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
        <SelectField
          id="news-type"
          name="type"
          label={labels.type}
          value={query.type}
          onChange={(value) => onSelect("type", value)}
          options={[
            { value: "all", label: labels.typeAll },
            { value: "verified", label: labels.typeVerified },
            { value: "rumor", label: labels.typeRumor },
          ]}
        />
        <SelectField
          id="news-source"
          name="source"
          label={labels.source}
          value={query.source}
          onChange={(value) => onSelect("source", value)}
          options={[{ value: "", label: labels.sourceAll }, ...sources]}
        />
        <SelectField
          id="news-company"
          name="company"
          label={labels.company}
          value={query.company}
          onChange={(value) => onSelect("company", value)}
          options={[{ value: "", label: labels.companyAll }, ...companies]}
        />
        <SelectField
          id="news-writer"
          name="writer"
          label={labels.writer}
          value={query.writer}
          onChange={(value) => onSelect("writer", value)}
          options={[{ value: "", label: labels.writerAll }, ...writers]}
        />
        <SelectField
          id="news-sort"
          name="sort"
          label={labels.sort}
          value={query.sort}
          onChange={(value) => onSelect("sort", value as NewsTableSort)}
          options={[
            { value: "date", label: labels.sortDate },
            { value: "title", label: labels.sortTitle },
            { value: "source", label: labels.sortSource },
          ]}
        />
        <Button type="submit" variant="outline">
          {applyLabel}
        </Button>
        {filtered ? (
          <Link
            href={clearHref}
            rel="nofollow"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm pb-2 text-sm underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              go(clearHref);
            }}
          >
            {clearLabel}
          </Link>
        ) : null}
      </form>

      {chips.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={filtersLabel}>
          {chips.map((chip) => (
            <li key={chip.id}>
              <Badge
                variant="outline"
                className="gap-1 px-2 py-1 font-sans text-sm font-normal"
              >
                {chip.label}
                <Link
                  href={chip.href}
                  rel="nofollow"
                  aria-label={chip.clearLabel}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -my-1 inline-flex size-5 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey ||
                      event.button !== 0
                    ) {
                      return;
                    }
                    event.preventDefault();
                    go(chip.href);
                  }}
                >
                  <span aria-hidden="true">×</span>
                </Link>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <p
        className="text-muted-foreground mt-4 font-mono text-xs"
        aria-live="polite"
        aria-atomic="true"
      >
        {resultCount}
      </p>

      <div aria-busy={pending || undefined}>
        {pending ? (
          <>
            <p className="sr-only" role="status">
              {loadingLabel}
            </p>
            <NewsTableSkeleton />
          </>
        ) : null}
        <div
          hidden={pending || undefined}
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            ) {
              return;
            }
            const anchor = (event.target as HTMLElement | null)?.closest("a");
            if (!anchor || anchor.target === "_blank") return;
            const href = anchor.getAttribute("href");
            if (!href) return;
            const next = newsHrefFromAnchor(href);
            if (!next) return;
            event.preventDefault();
            go(next);
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

function SelectField({
  id,
  name,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-44">
      <label
        htmlFor={id}
        className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
      >
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        className={fieldClass}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
