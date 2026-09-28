"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ResourceRow = { label: string; url: string };

const MAX_RESOURCES = 20;

/** A link the server accepts: a full web address. */
export function isResourceUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url.trim());
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * The rows that can be saved: named, with a full web address. Half-typed
 * rows stay in the draft (and show a hint) but are not sent, so one
 * unfinished link never makes the whole lesson fail to save.
 */
export function savableResources(rows: readonly ResourceRow[]): ResourceRow[] {
  return rows
    .map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
    .filter((r) => r.label && isResourceUrl(r.url));
}

/**
 * True while a row the author started (not left fully blank) cannot be saved
 * yet. That row is unsaved work: the pane reports it as such so the leave
 * guard and the publish/switch checks see it.
 */
export function hasUnsavableResources(rows: readonly ResourceRow[]): boolean {
  return rows.some(
    (r) =>
      (r.label.trim() !== "" || r.url.trim() !== "") &&
      !(r.label.trim() && isResourceUrl(r.url)),
  );
}

/** Row-based editor for a lesson's links ({label, url}). */
export function ResourcesEditor({
  resources,
  onChange,
  disabled,
}: {
  resources: ResourceRow[];
  onChange: (next: ResourceRow[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("classroomBuilder");
  const uid = useId();
  const update = (i: number, patch: Partial<ResourceRow>) =>
    onChange(resources.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      {resources.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noResources")}</p>
      ) : null}
      {resources.map((row, i) => {
        const n = i + 1;
        const labelId = `${uid}-label-${i}`;
        const urlId = `${uid}-url-${i}`;
        const hintId = `${uid}-hint-${i}`;
        const urlInvalid = row.url.trim() !== "" && !isResourceUrl(row.url);
        const nameMissing = row.url.trim() !== "" && row.label.trim() === "";
        const urlMissing = row.label.trim() !== "" && row.url.trim() === "";
        const urlProblem = urlInvalid || urlMissing;
        const hint = urlInvalid
          ? t("resourceUrlInvalid")
          : urlMissing
            ? t("resourceUrlMissing")
            : nameMissing
              ? t("resourceNameMissing")
              : null;
        return (
          <div
            key={i}
            className="border-border flex flex-col gap-2 rounded-md border p-2"
          >
            <div className="flex items-center gap-2">
              <Label htmlFor={labelId} className="sr-only">
                {t("resourceLabel", { n })}
              </Label>
              <Input
                id={labelId}
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder={t("resourceLabelPlaceholder")}
                maxLength={120}
                disabled={disabled}
                aria-invalid={(!disabled && nameMissing) || undefined}
                aria-describedby={hint && nameMissing ? hintId : undefined}
              />
              {disabled ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() =>
                    onChange(resources.filter((_, idx) => idx !== i))
                  }
                  aria-label={t("removeResource", { n })}
                >
                  <X />
                </Button>
              )}
            </div>
            <Label htmlFor={urlId} className="sr-only">
              {t("resourceUrl", { n })}
            </Label>
            <Input
              id={urlId}
              type="url"
              inputMode="url"
              value={row.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder={t("resourceUrlPlaceholder")}
              maxLength={500}
              disabled={disabled}
              aria-invalid={(!disabled && urlProblem) || undefined}
              aria-describedby={hint && urlProblem ? hintId : undefined}
            />
            {hint && !disabled ? (
              <p id={hintId} className="text-destructive text-sm">
                {hint}
              </p>
            ) : null}
          </div>
        );
      })}
      {disabled ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...resources, { label: "", url: "" }])}
          disabled={resources.length >= MAX_RESOURCES}
        >
          <Plus />
          {t("addResource")}
        </Button>
      )}
    </div>
  );
}
