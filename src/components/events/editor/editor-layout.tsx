import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";

/** The editor's section ids, in page order: the nav and the page share them. */
export const EDITOR_SECTIONS = [
  "import",
  "basics",
  "audience",
  "when",
  "where",
  "registration",
  "curation",
] as const;
export type EditorSectionId = (typeof EDITOR_SECTIONS)[number];

/**
 * One section of the event editor: the House Kicker as its heading, a line
 * of plain words saying what it is for, then its fields. Flat and
 * border-divided, per DESIGN.md — no card per section.
 */
export function EditorSection({
  id,
  title,
  description,
  children,
}: {
  id: EditorSectionId;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="border-border scroll-mt-24 border-t py-8 first:border-t-0 first:pt-0"
    >
      <SectionLabel as="h2" id={`${id}-heading`} bordered={false}>
        {title}
      </SectionLabel>
      {description ? (
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          {description}
        </p>
      ) : null}
      <div className="mt-6 grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** A labelled control with an optional hint; `wide` spans both columns. */
export function Field({
  id,
  label,
  hint,
  wide = false,
  children,
}: {
  id?: string;
  label: string;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p
          className="text-muted-foreground text-xs"
          id={id ? `${id}-hint` : undefined}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
