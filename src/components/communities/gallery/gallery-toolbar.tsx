"use client";

import { useFormatter, useTranslations } from "next-intl";

import { ChoiceChips } from "@/components/ui/choice-chips";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  topicText,
  type TopicLabelSource,
} from "@/lib/communities/topic-label";
import { cn } from "@/lib/utils";
import type { GalleryMediaType } from "@/lib/gallery-rules";
import type { GalleryFacets } from "@/server/gallery/items";

import type { GalleryFilters } from "./gallery-params";

type FilterPatch = Partial<Pick<GalleryFilters, "event" | "topic" | "type">>;

const ALL = "all";
const NO_EVENT = "none";
/** No topic slug is empty (the API requires at least one character). */
const ALL_TOPICS = "";

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
 * category choices come from the items the viewer may see (facets). A
 * control with nothing to choose between is left out — unless a filter is
 * set: a filter from a link (an event's "See all in the gallery") always
 * shows as chosen, with "All" beside it, even while the facets load, fail
 * or do not list it. So a filtered wall always says so and can be cleared.
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
  topics: readonly TopicLabelSource[];
  onChange: (patch: FilterPatch) => void;
  className?: string;
}) {
  const t = useTranslations("gallery.filters");
  const eventDay = useEventDay();

  const events = facets?.events ?? [];
  const showEvents = events.length > 0 || filters.event !== null;
  const linkedEventMissing =
    typeof filters.event === "number" &&
    !events.some((event) => event.id === filters.event);

  const topicSlugs = facets?.topics ?? [];
  const categoryChoices =
    filters.topic && !topicSlugs.includes(filters.topic)
      ? [...topicSlugs, filters.topic]
      : topicSlugs;
  const showCategories = categoryChoices.length > 0;

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
        <ChoiceChips
          aria-label={t("category")}
          value={filters.topic ?? ALL_TOPICS}
          onValueChange={(value) =>
            onChange({ topic: value === ALL_TOPICS ? null : value })
          }
          options={[
            { value: ALL_TOPICS, label: t("allCategories") },
            ...categoryChoices.map((slug) => ({
              value: slug,
              label: topicText(slug, topics),
            })),
          ]}
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
