"use client";

import { useTranslations } from "next-intl";

type Category = "all" | "general" | "question" | "showcase" | "job";

const categories: Category[] = ["all", "general", "question", "showcase", "job"];

type CategoryTabsProps = {
  active: Category;
  onChange: (category: Category) => void;
};

export function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  const t = useTranslations("forum");

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`shrink-0 rounded px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
            active === cat
              ? "bg-zinc-100 text-zinc-900"
              : "text-zinc-400 hover:text-zinc-600"
          }`}
        >
          {t(cat)}
        </button>
      ))}
    </div>
  );
}

export type { Category };
