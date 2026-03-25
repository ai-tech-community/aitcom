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

interface ForumPageProps {
  communitySlug?: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

export function ForumPage({ communitySlug, memberRole }: ForumPageProps = {}) {
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
    communitySlug,
  });

  const threads = data?.threads ?? [];
  const hasNextPage = data?.hasNextPage ?? false;
  const noResults = !isLoading && threads.length === 0 && debouncedSearch;
  const noThreads = !isLoading && threads.length === 0 && !debouncedSearch;

  const isCommunity = !!communitySlug;

  return (
    <div className={isCommunity ? "" : "mx-auto max-w-6xl px-6 py-12 sm:px-12"}>
      {/* Header — only on the global forum page */}
      {!isCommunity && (
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
            {t("title")}
          </h1>
          <p className="mt-1 font-mono text-xs tracking-wider text-zinc-400">
            {t("subtitle")}
          </p>
        </div>
      )}

      {/* Search + New Thread */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("search")}
            className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 w-full rounded-md border py-2 pl-9 pr-3 font-mono text-xs focus:outline-none focus:ring-1"
          />
        </div>
        {session?.user ? (
          <Link
            href={communitySlug ? `/forum/new?community=${communitySlug}` as never : "/forum/new"}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("newThread")}
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-[10px] underline underline-offset-4 transition-colors"
          >
            {t("loginToPost")}
          </Link>
        )}
      </div>

      {/* Category tabs + Sort */}
      <div className="border-border mb-5 flex items-center justify-between gap-4 border-b pb-3">
        <CategoryTabs active={category} onChange={handleCategoryChange} />
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground font-mono text-[9px] uppercase tracking-widest">
            {t("sort")}:
          </span>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as Sort)}
            className="border-border bg-background text-foreground focus:border-ring focus:ring-ring/30 w-full rounded border px-2 py-1 font-mono text-[10px] focus:outline-none focus:ring-1 sm:w-auto"
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
              className="bg-muted h-16 animate-pulse rounded-lg"
            />
          ))}
        </div>
      ) : noResults ? (
        <p className="text-muted-foreground py-12 text-center font-mono text-xs">
          {t("noResults")}
        </p>
      ) : noThreads ? (
        <p className="text-muted-foreground py-12 text-center font-mono text-xs">
          {t("noThreads")}
        </p>
      ) : (
        <div className="space-y-3">
          {threads.map((thread, i) => (
            <ThreadCard key={thread.id} thread={thread} index={i} memberRole={memberRole} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasNextPage && !isLoading && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="border-border text-muted-foreground hover:border-ring hover:bg-secondary rounded-md border px-6 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors"
          >
            {t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
