"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/lexical";

// Sticky header offset (top-24 = 6rem ≈ 96px). Headings hidden under the
// header shouldn't count as "active", so we shrink the observer root from the
// top by roughly this much, and from the bottom so a heading only becomes
// active once it reaches the upper third of the viewport.
const ROOT_MARGIN = "-96px 0px -66% 0px";

export function BlogToc({
  headings,
  label,
}: {
  headings: Heading[];
  label: string;
}) {
  const [activeSlug, setActiveSlug] = useState<string>(
    headings[0]?.slug ?? "",
  );

  useEffect(() => {
    const elements = headings
      .map((h) => document.getElementById(h.slug))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();

    const pickActive = () => {
      // Prefer the first heading (in document order) currently in view.
      const firstVisible = headings.find((h) => visible.has(h.slug));
      if (firstVisible) {
        setActiveSlug(firstVisible.slug);
        return;
      }
      // Nothing in the active band (e.g. mid-section or scrolled past the
      // last heading): fall back to the last heading above the fold.
      let current = headings[0]?.slug ?? "";
      for (const h of headings) {
        const el = document.getElementById(h.slug);
        if (el && el.getBoundingClientRect().top <= 96) {
          current = h.slug;
        }
      }
      setActiveSlug(current);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        pickActive();
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <nav className="sticky top-24">
        <h2 className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wider">
          / {label}
        </h2>
        <ul className="border-border border-l">
          {headings.map((heading) => {
            const isActive = heading.slug === activeSlug;
            return (
              <li key={heading.slug} className="-ml-px">
                <a
                  href={`#${heading.slug}`}
                  aria-current={isActive ? "location" : undefined}
                  className={`block border-l-2 py-1 font-mono text-sm transition-colors ${
                    heading.level === 3 ? "pl-6" : "pl-3"
                  } ${
                    isActive
                      ? "border-foreground text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground border-transparent"
                  }`}
                >
                  {heading.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
