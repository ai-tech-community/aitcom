"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search, Plus } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { CategoryTabs, type Category } from "./category-tabs";
import { ThreadCard } from "./thread-card";

type Sort = "newest" | "mostReplied" | "trending" | "lastActive";

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

export function ForumPage() {
  const t = useTranslations("forum");
  const { data: session } = authClient.useSession();

  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<Sort>("newest");
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

  // Reset page when category or sort changes
  const handleCategoryChange = useCallback((cat: Category) => {
    setCategory(cat);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((s: Sort) => {
    setSort(s);
    setPage(1);
  }, []);

  const { data, isLoading } = api.forum.getThreads.useQuery({
    category,
    sort,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    page,
  });

  const threads = data?.threads ?? [];
  const hasNextPage = data?.hasNextPage ?? false;
  const noResults = !isLoading && threads.length === 0 && debouncedSearch;
  const noThreads = !isLoading && threads.length === 0 && !debouncedSearch;

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

      {/* Search + New Thread */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("search")}
            className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
          />
        </div>
        {session?.user ? (
          <Link
            href="/forum/new"
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" />
            {t("newThread")}
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            className="shrink-0 font-mono text-[10px] text-zinc-400 underline underline-offset-4 transition-colors hover:text-zinc-600"
          >
            {t("loginToPost")}
          </Link>
        )}
      </div>

      {/* Category tabs + Sort */}
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-zinc-200 pb-3">
        <CategoryTabs active={category} onChange={handleCategoryChange} />
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
            {t("sort")}:
          </span>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as Sort)}
            className="w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] text-zinc-600 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300 sm:w-auto"
          >
            <option value="newest">{t("sortNewest")}</option>
            <option value="mostReplied">{t("sortMostReplied")}</option>
            <option value="trending">{t("sortTrending")}</option>
            <option value="lastActive">{t("sortLastActive")}</option>
          </select>
        </div>
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-zinc-100"
            />
          ))}
        </div>
      ) : noResults ? (
        <p className="py-12 text-center font-mono text-xs text-zinc-400">
          {t("noResults")}
        </p>
      ) : noThreads ? (
        <p className="py-12 text-center font-mono text-xs text-zinc-400">
          {t("noThreads")}
        </p>
      ) : (
        <div className="space-y-3">
          {threads.map((thread, i) => (
            <ThreadCard key={thread.id} thread={thread} index={i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasNextPage && !isLoading && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-zinc-200 px-6 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            {t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
