"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search, Plus } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { LaunchpadCard } from "./launchpad-card";

type Sort = "newest" | "mostVoted" | "recentlyUpdated" | "trending";
type Stage = "all" | "idea" | "prototype" | "mvp" | "launched";

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

export function LaunchpadListing() {
  const t = useTranslations("launchpad");
  const { data: session } = authClient.useSession();

  const [sort, setSort] = useState<Sort>("newest");
  const [stage, setStage] = useState<Stage>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, DEBOUNCE_MS);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSortChange = useCallback((s: Sort) => {
    setSort(s);
    setPage(1);
  }, []);

  const handleStageChange = useCallback((s: Stage) => {
    setStage(s);
    setPage(1);
  }, []);

  const { data, isLoading } = api.launchpad.list.useQuery({
    sort,
    stage,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    page,
  });

  const projects = data?.projects ?? [];
  const hasNextPage = data?.hasNextPage ?? false;
  const isEmpty = !isLoading && projects.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:px-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
          {t("title")}
        </h1>
        <p className="mt-1 font-mono text-xs tracking-wider text-zinc-400">
          {t("subtitle")}
        </p>
      </div>

      {/* Search + Submit */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("form.titlePlaceholder")}
            className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
          />
        </div>
        {session?.user && (
          <Link
            href="/launchpad/new"
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" />
            {t("submitProject")}
          </Link>
        )}
      </div>

      {/* Sort + Stage filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-zinc-200 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
            Sort:
          </span>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as Sort)}
            className="rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] text-zinc-600 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
          >
            <option value="newest">{t("sort.newest")}</option>
            <option value="mostVoted">{t("sort.mostVoted")}</option>
            <option value="recentlyUpdated">{t("sort.recentlyUpdated")}</option>
            <option value="trending">{t("sort.trending")}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={stage}
            onChange={(e) => handleStageChange(e.target.value as Stage)}
            className="rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] text-zinc-600 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
          >
            <option value="all">{t("filter.allStages")}</option>
            <option value="idea">{t("stage.idea")}</option>
            <option value="prototype">{t("stage.prototype")}</option>
            <option value="mvp">{t("stage.mvp")}</option>
            <option value="launched">{t("stage.launched")}</option>
          </select>
        </div>
      </div>

      {/* Grid / Loading / Empty */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg bg-zinc-100"
            />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="py-12 text-center font-mono text-xs text-zinc-400">
          {t("noProjects")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, i) => (
            <LaunchpadCard key={project.id} project={project} index={i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && (page > 1 || hasNextPage) && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {page > 1 && (
            <button
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-zinc-200 px-6 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              Prev
            </button>
          )}
          {hasNextPage && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-zinc-200 px-6 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
