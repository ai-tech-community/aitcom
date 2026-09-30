"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, Circle, MessageSquareText, Users } from "lucide-react";

import { SectionLabel } from "@/components/ui/section-label";
import { presentEventRows } from "@/components/events/rows/event-rows";
import { CompactEventRow } from "@/components/events/rows/compact-event-row";
import { useEventRowLabels } from "@/components/events/rows/use-event-row-labels";
import type { ChecklistItem } from "./editor-checklist";
import type { EventFormData } from "./event-form-model";

/**
 * The editor's right pane on wide screens: what is still missing, and how
 * the event will read in a list — the real (compact) list row, fed by the
 * form as you type.
 */
export function EditorSummaryPane({
  form,
  checklist,
  communityName,
}: {
  form: EventFormData;
  checklist: readonly ChecklistItem[];
  communityName: string;
}) {
  const t = useTranslations("events.editor");
  const locale = useLocale();
  const labels = useEventRowLabels();
  const remaining = checklist.filter((i) => !i.done).length;

  const [row] = form.date
    ? presentEventRows(
        [
          {
            id: "preview",
            slug: null,
            title: form.title.trim() || t("previewUntitled"),
            type: form.type,
            format: form.format || null,
            date: form.date,
            startTime: form.startTime || null,
            timezone: form.timezone || null,
            city: form.city || null,
            country: form.country || null,
            location: form.location || null,
            host: communityName,
          },
        ],
        { locale, labels },
      )
    : [];

  return (
    <div className="space-y-8 p-4">
      <section aria-labelledby="editor-checklist">
        <SectionLabel id="editor-checklist">{t("checklistTitle")}</SectionLabel>
        <p className="text-muted-foreground mt-3 text-sm">
          {remaining === 0
            ? t("checklistReady")
            : t("checklistRemaining", { count: remaining })}
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {checklist.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.section}`}
                className="hover:bg-secondary/60 focus-visible:ring-ring/50 flex items-center gap-2 rounded-md px-2 py-1.5 outline-none focus-visible:ring-[3px]"
              >
                {item.done ? (
                  <Check
                    className="text-success size-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={item.done ? "text-muted-foreground" : undefined}
                >
                  {t(`checklist.${item.id}`)}
                </span>
                <span className="sr-only">
                  {item.done ? t("checklistDone") : t("checklistTodo")}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="editor-preview">
        <SectionLabel id="editor-preview">{t("previewTitle")}</SectionLabel>
        {row ? (
          // The compact row: the list form made for narrow side columns.
          <div className="border-border mt-3 rounded-xl border px-4">
            <CompactEventRow
              row={row}
              withTime
              where={[...row.placeParts, row.kind.label]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            {t("previewNeedsDate")}
          </p>
        )}
        <ul className="text-muted-foreground mt-3 space-y-1.5 text-sm">
          {form.sourceUrl.trim() ? (
            <li>{t("previewExternal")}</li>
          ) : (
            <>
              <li className="flex items-center gap-2">
                <Users className="size-4 shrink-0" aria-hidden="true" />
                {form.maxAttendees
                  ? t("previewSeats", { count: Number(form.maxAttendees) })
                  : t("previewNoLimit")}
              </li>
              <li className="flex items-center gap-2">
                <MessageSquareText
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                {t("previewQuestions", {
                  count: form.registrationQuestions.length,
                })}
              </li>
            </>
          )}
        </ul>
      </section>
    </div>
  );
}
