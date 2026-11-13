"use client";

import { useId } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GalleryMediaType } from "@/lib/gallery-rules";
import type { GalleryFacets } from "@/server/gallery/items";

import { topicText, type GalleryTopic } from "./gallery-item-text";
import type { GalleryFilters } from "./gallery-params";

type FilterPatch = Partial<Pick<GalleryFilters, "event" | "topic" | "type">>;

const ALL = "all";
const NO_EVENT = "none";

/** "Nov 2, 2026" for the event's own day (`YYYY-MM-DD`, no time zone). */
function useEventDay() {
  const format = useFormatter();
  return (day: string) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), {
      dateStyle: "medium",
      timeZone: "UTC",
    });
}

/**
 * The wall's filters: event, category and photos/videos. The event and
 * category choices come from the items the viewer may see (facets); while
 * those are unknown, or there is nothing to choose between, only the type
 * filter shows. A filter from a link that is not among the choices still
 * shows as chosen, so the toolbar never misstates what the wall shows.
 */
export function GalleryToolbar({
  filters,
  facets,
  topics,
  onChange,
  className,
}: {
  filters: GalleryFilters;
  facets: GalleryFacets | undefined;
  /** The community's topics, for category labels (slugs otherwise). */
  topics: readonly GalleryTopic[];
  onChange: (patch: FilterPatch) => void;
  className?: string;
}) {
  const t = useTranslations("gallery.filters");
  const eventDay = useEventDay();

  const events = facets?.events ?? [];
  const showEvents = events.length > 0;
  const linkedEventMissing =
    typeof filters.event === "number" &&
    !events.some((event) => event.id === filters.event);

  const topicSlugs = facets?.topics ?? [];
  const categoryChoices =
    filters.topic && !topicSlugs.includes(filters.topic)
      ? [...topicSlugs, filters.topic]
      : topicSlugs;
  const showCategories = facets !== undefined && categoryChoices.length > 0;

  const eventValue = filters.event === null ? ALL : String(filters.event);

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn("flex flex-wrap items-center gap-3", className)}
    >
      {showEvents ? (
        <Select
          value={eventValue}
          onValueChange={(value) =>
            onChange({
              event:
                value === ALL
                  ? null
                  : value === NO_EVENT
                    ? "none"
                    : Number(value),
            })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label={t("event")}
            className="max-w-full min-w-0 sm:max-w-72"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allEvents")}</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={String(event.id)}>
                {t("eventOption", {
                  title: event.title,
                  day: eventDay(event.day),
                })}
              </SelectItem>
            ))}
            {linkedEventMissing ? (
              <SelectItem value={eventValue}>{t("thisEvent")}</SelectItem>
            ) : null}
            {facets?.hasUnlinked || filters.event === "none" ? (
              <SelectItem value={NO_EVENT}>{t("noEvent")}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      ) : null}

      {showCategories ? (
        <CategoryChips
          label={t("category")}
          allLabel={t("allCategories")}
          choices={categoryChoices.map((slug) => ({
            value: slug,
            label: topicText(slug, topics),
          }))}
          value={filters.topic}
          onChange={(topic) => onChange({ topic })}
        />
      ) : null}

      <SegmentedControl<GalleryMediaType | typeof ALL>
        size="sm"
        aria-label={t("type")}
        value={filters.type ?? ALL}
        onValueChange={(value) =>
          onChange({ type: value === ALL ? null : value })
        }
        options={[
          { value: ALL, label: t("allTypes") },
          { value: "photo", label: t("photos") },
          { value: "video", label: t("videos") },
        ]}
      />
    </div>
  );
}

/**
 * One-of-many category chips on native radios, so arrow keys and screen
 * readers work as they do for any radio group (like `SegmentedControl`).
 */
function CategoryChips({
  label,
  allLabel,
  choices,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  choices: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const name = useId();
  const options = [{ value: null, label: allLabel }, ...choices];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value ?? ""}
            data-state={checked ? "active" : "inactive"}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors",
              "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
              checked
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:bg-accent",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value ?? ""}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
