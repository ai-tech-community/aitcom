"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

import { api } from "@/trpc/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  redesigned = false,
  className,
}: {
  communitySlug: string;
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
  redesigned?: boolean;
  className?: string;
}) {
  const t = useTranslations("communities.feed");
  const { data: topics } = api.topics.list.useQuery({ communitySlug });
  if (!topics || topics.length < 2) return null;
  const options = topics.map(({ slug, label, emoji }) => ({
    value: slug,
    label: emoji ? `${emoji} ${label}` : label,
  }));
  if (!options.some((topic) => topic.value === value)) {
    options.unshift({ value, label: value });
  }

  if (redesigned) {
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          aria-label={t("selectTopic")}
          size="sm"
          className={cn("max-w-44 text-base md:text-sm", className)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="motion-reduce:animate-none">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-11 sm:min-h-8"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={t("selectTopic")}
      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 ml-1 h-8 max-w-44 truncate rounded-md border px-2 text-base outline-none focus-visible:ring-[3px] disabled:opacity-50 md:text-sm"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
