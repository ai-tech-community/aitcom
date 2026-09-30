"use client";

import { useTranslations } from "next-intl";

import { DEFAULT_EVENT_TIMEZONE } from "@/lib/event-time";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EventConflictPanel,
  SlotSuggestionChips,
} from "@/components/events/event-conflict-panel";
import { EditorSection, Field } from "../editor-layout";
import type { useEventConflicts } from "../use-event-conflicts";
import type { SectionProps } from "./types";

function timeZoneOptions(current: string): string[] {
  let zones: string[];
  try {
    zones = [...Intl.supportedValuesOf("timeZone")];
  } catch {
    zones = [DEFAULT_EVENT_TIMEZONE];
  }
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

/** When it happens, with live warnings about clashing events. */
export function WhenSection({
  form,
  update,
  conflicts,
}: SectionProps & { conflicts: ReturnType<typeof useEventConflicts> }) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");
  const flash = conflicts.flashClass;

  return (
    <EditorSection
      id="when"
      title={te("sections.when")}
      description={te("sections.whenHint")}
    >
      <Field id="event-date" label={t("eventDate")}>
        <Input
          id="event-date"
          type="date"
          value={form.date}
          onChange={(e) => update({ date: e.target.value })}
          required
          className={cn(flash)}
        />
      </Field>
      <Field
        id="event-timezone"
        label={t("eventTimezone")}
        hint={t("eventTimezoneHint")}
      >
        <Select
          value={form.timezone || DEFAULT_EVENT_TIMEZONE}
          onValueChange={(v) => update({ timezone: v })}
        >
          <SelectTrigger id="event-timezone" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timeZoneOptions(form.timezone).map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="event-start" label={t("eventStartTime")}>
        <Input
          id="event-start"
          type="time"
          value={form.startTime}
          onChange={(e) => update({ startTime: e.target.value })}
          className={cn(flash)}
        />
      </Field>
      <Field id="event-end" label={t("eventEndTime")}>
        <Input
          id="event-end"
          type="time"
          value={form.endTime}
          onChange={(e) => update({ endTime: e.target.value })}
          className={cn(flash)}
        />
      </Field>
      <div className="sm:col-span-2">
        {!conflicts.gateMet ? (
          <p className="text-muted-foreground text-xs">
            {t("conflictHintIncomplete")}
          </p>
        ) : null}
        <EventConflictPanel
          state={conflicts.state}
          conflicts={conflicts.data?.conflicts ?? []}
          checkedAudiences={conflicts.data?.checkedAudiences ?? []}
          onRetry={conflicts.retry}
          scope={form.city.trim() || undefined}
        >
          <SlotSuggestionChips
            suggestions={conflicts.data?.suggestions ?? []}
            checkedAudiences={conflicts.data?.checkedAudiences ?? []}
            timezone={form.timezone || DEFAULT_EVENT_TIMEZONE}
            onApply={conflicts.applySlot}
          />
        </EventConflictPanel>
      </div>
    </EditorSection>
  );
}
