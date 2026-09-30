"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import {
  EVENT_FOCUS_LABELS,
  EVENT_FOCUS_OPTIONS,
  EVENT_LEVEL_LABELS,
  EVENT_LEVEL_OPTIONS,
  type EventFocus,
  type EventLevel,
} from "@/lib/event-metadata";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorSection, Field } from "../editor-layout";
import type { SectionProps } from "./types";

/**
 * Who the event is for. Comes before "When": the clash check needs at
 * least one audience to know whose calendar to compare against.
 */
export function AudienceSection({ form, update }: SectionProps) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");
  const audiences = api.audiences.list.useQuery();

  const toggle = (slug: string) =>
    update({
      audience: form.audience.includes(slug)
        ? form.audience.filter((a) => a !== slug)
        : [...form.audience, slug],
    });

  return (
    <EditorSection
      id="audience"
      title={te("sections.audience")}
      description={te("sections.audienceHint")}
    >
      <Field label={t("audienceLabel")} wide>
        {/* aria-pressed + check glyph: selected is never fill colour alone. */}
        <div
          role="group"
          aria-label={t("audienceLabel")}
          className="flex flex-wrap gap-2"
        >
          {audiences.isLoading ? (
            <>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
            </>
          ) : (
            (audiences.data ?? []).map(({ slug, name }) => {
              const active = form.audience.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(slug)}
                  className={cn(
                    "focus-visible:ring-ring/50 inline-flex min-h-8 items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : null}
                  {name}
                </button>
              );
            })
          )}
        </div>
      </Field>
      <Field id="event-focus" label={t("focusLabel")}>
        <Select
          value={form.focus || "__none"}
          onValueChange={(v) =>
            update({ focus: v === "__none" ? "" : (v as EventFocus) })
          }
        >
          <SelectTrigger id="event-focus" className="w-full">
            <SelectValue placeholder={t("selectFocus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">{t("selectNone")}</SelectItem>
            {EVENT_FOCUS_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_FOCUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="event-level" label={t("levelLabel")}>
        <Select
          value={form.level || "__none"}
          onValueChange={(v) =>
            update({ level: v === "__none" ? "" : (v as EventLevel) })
          }
        >
          <SelectTrigger id="event-level" className="w-full">
            <SelectValue placeholder={t("selectLevel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">{t("selectNone")}</SelectItem>
            {EVENT_LEVEL_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_LEVEL_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="event-tags" label={t("tagsLabel")} wide>
        <Input
          id="event-tags"
          value={form.tags}
          onChange={(e) => update({ tags: e.target.value })}
          placeholder="ai, llm, agents"
        />
      </Field>
    </EditorSection>
  );
}
