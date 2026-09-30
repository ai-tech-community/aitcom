"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditorSection, Field } from "../editor-layout";
import type { SectionProps } from "./types";

/**
 * Admin-only curation signals used by discovery and ranking. Folded away:
 * most organizers never need them.
 */
export function CurationSection({ form, update }: SectionProps) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");

  return (
    <EditorSection
      id="curation"
      title={te("sections.curation")}
      description={te("sections.curationHint")}
    >
      <details className="group sm:col-span-2">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
          {te("showCuration")}
        </summary>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="event-score" label={t("aitFitScoreLabel")}>
            <Input
              id="event-score"
              type="number"
              min={1}
              max={10}
              value={form.aitFitScore}
              onChange={(e) => update({ aitFitScore: e.target.value })}
            />
          </Field>
          <Field id="event-confidence" label={t("confidenceScoreLabel")}>
            <Input
              id="event-confidence"
              type="number"
              min={0}
              max={1}
              step="0.1"
              value={form.confidenceScore}
              onChange={(e) => update({ confidenceScore: e.target.value })}
            />
          </Field>
          <Field id="event-discovery-source" label={t("discoverySourceLabel")}>
            <Input
              id="event-discovery-source"
              value={form.discoverySource}
              onChange={(e) => update({ discoverySource: e.target.value })}
              placeholder="luma, meetup, linkedin"
            />
          </Field>
          <Field id="event-last-verified" label={t("lastVerifiedAtLabel")}>
            <Input
              id="event-last-verified"
              type="datetime-local"
              value={form.lastVerifiedAt}
              onChange={(e) => update({ lastVerifiedAt: e.target.value })}
            />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              tone="ink"
              id="event-curated"
              checked={form.curatedByAgent}
              onCheckedChange={(v) => update({ curatedByAgent: v === true })}
            />
            <Label htmlFor="event-curated">{t("curatedByAgent")}</Label>
          </div>
        </div>
      </details>
    </EditorSection>
  );
}
