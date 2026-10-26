"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { renderBuilderItemEditor } from "./items/registry";
import type { BuilderItem } from "./items-model";

/** The same limit the server's item input enforces. */
const INTRO_MAX = 280;

/**
 * The one panel for an issue item: the intro line every kind shares, then
 * the kind's own editor when it has one (an editorial block's heading and
 * text). Done lives here, so a kind's editor does not carry its own.
 */
export function ItemDetailsPanel({
  item,
  kindLabel,
  onChange,
  onDone,
}: {
  item: BuilderItem;
  kindLabel: string;
  onChange: (patch: Partial<BuilderItem>) => void;
  onDone: () => void;
}) {
  const t = useTranslations("magazineEditor.builder.details");
  const labelId = useId();
  const introId = useId();
  const helpId = useId();

  return (
    <section
      aria-labelledby={labelId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <h3 id={labelId} className="text-sm font-medium">
        {kindLabel}
      </h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={introId}>{t("intro")}</Label>
        <Input
          id={introId}
          value={item.intro ?? ""}
          maxLength={INTRO_MAX}
          aria-describedby={helpId}
          onChange={(event) =>
            onChange({
              intro: event.target.value ? event.target.value : undefined,
            })
          }
        />
        <p id={helpId} className="text-muted-foreground text-sm">
          {t("introHelp")}
        </p>
      </div>
      {renderBuilderItemEditor(item, {
        onChange: (patch) => onChange(patch as Partial<BuilderItem>),
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onDone}
      >
        {t("done")}
      </Button>
    </section>
  );
}
