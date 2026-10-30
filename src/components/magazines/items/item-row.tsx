import type { ReactNode } from "react";

import type { ItemKindId } from "@/lib/magazines/item-views";

/** Shared row typography; each kind supplies its own title, link and fact. */
export function ItemRow({
  kind,
  title,
  label,
  intro,
  fact,
  note,
}: {
  kind: ItemKindId;
  title: ReactNode;
  label: string;
  intro: string | null;
  fact?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <article
      data-item-kind={kind}
      className="flex min-w-0 flex-col gap-1.5 py-4"
    >
      {title && (
        <h2 className="text-lg leading-snug font-semibold break-words">
          {title}
        </h2>
      )}
      {intro && (
        <p className="text-muted-foreground line-clamp-1 text-sm">{intro}</p>
      )}
      <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm">{label}</p>
        {fact != null && <p className="font-mono text-xs">{fact}</p>}
      </div>
      {note}
    </article>
  );
}
