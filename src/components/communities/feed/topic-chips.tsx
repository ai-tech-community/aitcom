"use client";

import { useTranslations } from "next-intl";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { topicLabel } from "@/lib/communities/topic-label";
import { api } from "@/trpc/react";

export interface TopicChip {
  id: number;
  label: string;
  slug: string;
  emoji?: string | null;
}

/** Presentational chip row — pure, easy to test. One topic at a time. */
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
  return (
    <ChoiceChips
      aria-label={t("selectTopic")}
      value={active}
      onValueChange={onSelect}
      options={[
        { value: "all", label: t("allTopics") },
        ...topics.map((topic) => ({
          value: topic.slug,
          label: topicLabel(topic),
        })),
      ]}
    />
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
  const { data: topics, isError } = api.topics.list.useQuery({
    communitySlug: slug,
  });
  if (isError) return null; // supplementary widget — may stay absent on error (No-Silent-Failure)
  // "All" plus a single topic filters nothing; show chips from two topics up.
  if (!topics || topics.length < 2) return null;
  return (
    <TopicChipsView
      topics={topics as TopicChip[]}
      active={active}
      onSelect={onSelect}
    />
  );
}
