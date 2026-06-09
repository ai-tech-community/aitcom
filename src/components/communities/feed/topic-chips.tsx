"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

export interface TopicChip {
  id: number;
  label: string;
  slug: string;
  emoji?: string | null;
}

/** Presentational chip row — pure, easy to test. */
export function TopicChipsView({
  topics,
  active,
  onSelect,
}: {
  topics: TopicChip[];
  active: string;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("communities.feed");
  const chip = (slug: string, label: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onSelect(slug)}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm transition-colors ${
        active === slug
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:bg-secondary/50"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {chip("all", t("allTopics"), "all")}
      {topics.map((tp) =>
        chip(
          tp.slug,
          `${tp.emoji ? `${tp.emoji} ` : ""}${tp.label}`,
          String(tp.id),
        ),
      )}
    </div>
  );
}

/** Data-bound wrapper used by the feed page. */
export function TopicChips({
  slug,
  active,
  onSelect,
}: {
  slug: string;
  active: string;
  onSelect: (slug: string) => void;
}) {
  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });
  if (!topics || topics.length === 0) return null;
  return (
    <TopicChipsView
      topics={topics as TopicChip[]}
      active={active}
      onSelect={onSelect}
    />
  );
}
