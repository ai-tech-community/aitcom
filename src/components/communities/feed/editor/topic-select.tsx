"use client";

import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";

/**
 * Which of the community's topics a post goes under, for the composer and
 * the edit form. One topic is no choice, so it shows once there are two.
 * A post filed under a topic its community no longer lists keeps that
 * topic as an option, so the picker never misstates where the post is.
 */
export function TopicSelect({
  communitySlug,
  value,
  onChange,
  disabled,
}: {
  communitySlug: string;
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed");
  const { data: topics } = api.topics.list.useQuery({ communitySlug });
  if (!topics || topics.length < 2) return null;
  const known = topics.some((topic) => topic.slug === value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={t("selectTopic")}
      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 ml-1 h-8 max-w-44 truncate rounded-md border px-2 text-base outline-none focus-visible:ring-[3px] disabled:opacity-50 md:text-sm"
    >
      {known ? null : <option value={value}>{value}</option>}
      {topics.map((topic) => (
        <option key={topic.id} value={topic.slug}>
          {topic.emoji ? `${topic.emoji} ` : ""}
          {topic.label}
        </option>
      ))}
    </select>
  );
}
