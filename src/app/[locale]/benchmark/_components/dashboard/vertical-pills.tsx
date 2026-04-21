// src/app/[locale]/benchmark/_components/dashboard/vertical-pills.tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Category = {
  id: string;
  slug: string;
  name: string;
};

type Props = {
  categories: Category[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
};

export function VerticalPills({ categories, activeSlug, onSelect }: Props) {
  return (
    <div
      className="scrollbar-hide flex gap-2 overflow-x-auto"
      role="tablist"
      aria-label="Benchmark category"
    >
      {categories.map((c) => {
        const active = c.slug === activeSlug;
        return (
          <Button
            key={c.id}
            role="tab"
            aria-selected={active}
            variant="ghost"
            size="sm"
            className={cn(
              "shrink-0",
              active && "bg-primary/10 text-primary hover:bg-primary/15",
            )}
            onClick={() => onSelect(c.slug)}
          >
            {c.name}
          </Button>
        );
      })}
    </div>
  );
}
