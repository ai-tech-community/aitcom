"use client";

import { useEffect, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";
import type { EditorSectionId } from "./editor-layout";

/**
 * The editor's section menu: the section on screen is marked (a bar and
 * weight, never colour alone), and a finished section gets a tick. The
 * section in view is tracked inside the editor's own scroll area.
 */
export function EditorSectionNav({
  sections,
  finished,
  scrollRoot,
}: {
  sections: readonly EditorSectionId[];
  finished: ReadonlySet<EditorSectionId>;
  scrollRoot: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("events.editor");
  const [current, setCurrent] = useState<EditorSectionId>(sections[0]!);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<EditorSectionId, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(
            entry.target.id as EditorSectionId,
            entry.isIntersecting ? entry.intersectionRatio : 0,
          );
        }
        // The first section, in page order, that is on screen.
        const top = sections.find((id) => (visible.get(id) ?? 0) > 0);
        if (top) setCurrent(top);
      },
      {
        root: scrollRoot.current,
        // Count a section as current once it reaches the upper part.
        rootMargin: "0px 0px -60% 0px",
        threshold: [0, 0.01],
      },
    );
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections, scrollRoot]);

  return (
    <nav aria-label={t("sectionsNav")} className="p-3">
      <SectionLabel className="mx-2 mt-1 mb-2">
        {t("sectionsTitle")}
      </SectionLabel>
      <ul className="space-y-0.5 text-sm">
        {sections.map((id) => {
          const active = id === current;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={active ? "location" : undefined}
                onClick={() => setCurrent(id)}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-center justify-between gap-2 rounded-md border-l-2 px-2 py-1.5 outline-none focus-visible:ring-[3px]",
                  active
                    ? "border-foreground text-foreground bg-secondary/60 font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t(`sections.${id}`)}
                {finished.has(id) ? (
                  <Check
                    className="text-success size-3.5 shrink-0"
                    aria-label={t("sectionDone")}
                  />
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
