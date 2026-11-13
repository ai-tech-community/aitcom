"use client";

import { useId } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceChips } from "@/components/ui/choice-chips";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  topicLabel,
  topicText,
  type TopicLabelSource,
} from "@/lib/communities/topic-label";
import type { GalleryUploadChoices } from "@/server/gallery/items";

/**
 * The details a member chooses for their photos and videos, shared by the
 * upload dialog (for a whole batch) and Edit details (for one item), so
 * both ask the same way: the event, the category and magazine permission.
 */

/** The slice of the `gallery.uploadChoices` query the fields read. */
export type UploadChoicesQuery = {
  isPending: boolean;
  isError: boolean;
  data: GalleryUploadChoices | undefined;
  refetch: () => unknown;
};

const NO_EVENT = "none";
/** "No category" (a topic slug is never empty). */
const NO_TOPIC = "";

/** The event an id names, when uploads may link to it. */
export function linkableEvent(
  choices: GalleryUploadChoices | undefined,
  eventId: number | null,
) {
  return choices?.events.find((event) => event.id === eventId) ?? null;
}

/**
 * The event select, with "Not from an event" first. `current` is an event
 * the item already links to: it stays offered even when it could no longer
 * be chosen anew (the server keeps a link the item already has).
 */
export function GalleryEventField({
  choices,
  value,
  onChange,
  current,
  disabled,
}: {
  choices: UploadChoicesQuery;
  value: number | null;
  onChange: (eventId: number | null) => void;
  current?: { id: number; title: string } | null;
  disabled?: boolean;
}) {
  const t = useTranslations("gallery.upload");
  const format = useFormatter();
  const hintId = useId();
  const events = choices.data?.events ?? [];
  const keepCurrent =
    current != null && !events.some((event) => event.id === current.id);

  let control: React.ReactNode;
  if (choices.isPending) {
    control = (
      <Skeleton className="h-9 w-full max-w-sm" role="status">
        <span className="sr-only">{t("eventsLoading")}</span>
      </Skeleton>
    );
  } else if (choices.isError) {
    control = (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="text-muted-foreground">{t("eventsFailed")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void choices.refetch()}
        >
          {t("tryAgain")}
        </Button>
      </div>
    );
  } else {
    control = (
      <Select
        value={value === null ? NO_EVENT : String(value)}
        onValueChange={(next) =>
          onChange(next === NO_EVENT ? null : Number(next))
        }
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={t("event")}
          aria-describedby={hintId}
          className="w-full max-w-sm min-w-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_EVENT}>{t("noEvent")}</SelectItem>
          {keepCurrent ? (
            <SelectItem value={String(current.id)}>{current.title}</SelectItem>
          ) : null}
          {events.map((event) => (
            <SelectItem key={event.id} value={String(event.id)}>
              {t("eventOption", {
                title: event.title,
                day: format.dateTime(new Date(event.startsAt), {
                  dateStyle: "medium",
                }),
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{t("event")}</span>
      {control}
      <p id={hintId} className="text-muted-foreground text-xs">
        {t("eventHint")}
      </p>
    </div>
  );
}

/**
 * The category chips: "No category", then the community's topics. A topic
 * the item has that the community no longer lists stays offered by slug.
 * Left out while there are no topics to choose from (optional field).
 */
export function GalleryCategoryField({
  topics,
  value,
  onChange,
}: {
  topics: readonly TopicLabelSource[];
  value: string | null;
  onChange: (topicSlug: string | null) => void;
}) {
  const t = useTranslations("gallery.upload");
  if (topics.length === 0 && value === null) return null;
  const missing = value !== null && !topics.some((each) => each.slug === value);
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{t("category")}</span>
      <ChoiceChips
        aria-label={t("category")}
        value={value ?? NO_TOPIC}
        onValueChange={(next) => onChange(next === NO_TOPIC ? null : next)}
        options={[
          { value: NO_TOPIC, label: t("noCategory") },
          ...topics.map((topic) => ({
            value: topic.slug,
            label: topicLabel(topic),
          })),
          ...(missing ? [{ value, label: topicText(value, topics) }] : []),
        ]}
      />
    </div>
  );
}

/**
 * Magazine permission, unticked unless given (spec 2026-11-13, Decided by
 * Greg 4), with the hint that says what it means. Ink, not orange: the
 * dialog's one orange is its main action.
 */
export function GalleryMagazineField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("gallery.upload");
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        tone="ink"
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
        aria-describedby={`${id}-hint`}
      />
      <div className="grid gap-1">
        <label htmlFor={id} className="text-sm leading-snug font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {t("magazineHint")}
        </p>
      </div>
    </div>
  );
}

/** A character count under a text field, as `12/500`. */
export function TextCounter({
  id,
  count,
  max,
}: {
  id: string;
  count: number;
  max: number;
}) {
  const t = useTranslations("gallery.upload");
  return (
    <p id={id} className="text-muted-foreground font-mono text-xs tabular-nums">
      {t("counter", { count, max })}
    </p>
  );
}
