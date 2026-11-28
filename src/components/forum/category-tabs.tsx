"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Category = "all" | "general" | "question" | "showcase" | "job";

const categories: Category[] = [
  "all",
  "general",
  "question",
  "showcase",
  "job",
];

type CategoryTabsProps = {
  active: Category;
  onChange: (category: Category) => void;
  redesigned?: boolean;
};

export function CategoryTabs({
  active,
  onChange,
  redesigned = false,
}: CategoryTabsProps) {
  const t = useTranslations("forum");

  return (
    <div
      data-forum-categories=""
      className={cn(
        "flex gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden",
        !redesigned && "border-border border-b pb-3",
      )}
    >
      {categories.map((cat) => (
        <button
          type="button"
          key={cat}
          onClick={() => onChange(cat)}
          aria-pressed={redesigned ? active === cat : undefined}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 transition-colors",
            redesigned
              ? "focus-visible:ring-ring min-h-9 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset"
              : "rounded font-mono text-xs font-semibold tracking-widest uppercase",
            active === cat
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(cat)}
        </button>
      ))}
    </div>
  );
}

export type { Category };
