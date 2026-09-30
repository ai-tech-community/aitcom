"use client";

import { useTranslations } from "next-intl";

import {
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  type EventFormat,
} from "@/lib/event-metadata";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorSection, Field } from "../editor-layout";
import type { SectionProps } from "./types";

/** Where it happens: online, in person or both, and the place. */
export function WhereSection({ form, update }: SectionProps) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");

  return (
    <EditorSection
      id="where"
      title={te("sections.where")}
      description={te("sections.whereHint")}
    >
      <Field id="event-format" label={t("formatLabel")}>
        <Select
          value={form.format || "__none"}
          onValueChange={(v) =>
            update({ format: v === "__none" ? "" : (v as EventFormat) })
          }
        >
          <SelectTrigger id="event-format" className="w-full">
            <SelectValue placeholder={t("selectFormat")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">{t("selectNone")}</SelectItem>
            {EVENT_FORMAT_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_FORMAT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="event-location" label={t("eventLocation")}>
        <Input
          id="event-location"
          value={form.location}
          onChange={(e) => update({ location: e.target.value })}
          required
          maxLength={255}
        />
      </Field>
      <Field id="event-city" label={t("cityLabel")}>
        <Input
          id="event-city"
          value={form.city}
          onChange={(e) => update({ city: e.target.value })}
          maxLength={255}
        />
      </Field>
      <Field id="event-region" label={t("regionLabel")}>
        <Input
          id="event-region"
          value={form.region}
          onChange={(e) => update({ region: e.target.value })}
          maxLength={255}
        />
      </Field>
      <Field id="event-country" label={t("countryLabel")}>
        <Input
          id="event-country"
          value={form.country}
          onChange={(e) => update({ country: e.target.value })}
          maxLength={255}
        />
      </Field>
    </EditorSection>
  );
}
