"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import { CommunityCard } from "./community-card";
import { CreateCommunityDialog } from "./create-community-dialog";

const DEBOUNCE_MS = 300;

export function CommunitiesDirectory() {
  const t = useTranslations("communities");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { data, isLoading } = api.communities.list.useQuery({
    search: debouncedSearch || undefined,
    limit: 20,
  });

  const communities = data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border flex items-center justify-between border-b pb-4">
        <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("directory.title").toUpperCase()}
        </h1>
        <CreateCommunityDialog />
      </div>

      {/* Search */}
      <div className="mt-4">
        <Input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={`/ ${t("directory.search")}`}
          className="font-mono text-sm tracking-wider"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="border-border animate-pulse rounded-lg border p-4"
            >
              <div className="bg-muted h-12 w-12 rounded-lg" />
              <div className="bg-muted mt-3 h-4 w-3/4 rounded" />
              <div className="bg-muted mt-2 h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ) : communities.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">
          {t("directory.empty")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <CommunityCard
              key={community.id}
              slug={community.slug}
              name={community.name}
              description={community.description}
              logoUrl={community.logoUrl}
              memberCount={community.memberCount}
              joinPolicy={community.joinPolicy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
