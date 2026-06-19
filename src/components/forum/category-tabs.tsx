"use client";

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
};

export function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  const t = useTranslations("forum");

  return (
    <div className="border-border flex gap-1 overflow-x-auto border-b pb-3 [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`shrink-0 rounded px-2.5 py-1 font-mono text-xs font-semibold tracking-widest uppercase transition-colors ${
            active === cat
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(cat)}
        </button>
      ))}
    </div>
  );
}

export type { Category };
