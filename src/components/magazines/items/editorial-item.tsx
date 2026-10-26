import { LexicalRenderer } from "@/lib/lexical";
import { cn } from "@/lib/utils";

import type { ItemRendererProps, ItemTitle } from "./types";

/** Free-form text owned by the issue, rendered in full. */
export function EditorialItem({ view, lead }: ItemRendererProps<"editorial">) {
  return (
    <section
      data-item-kind="editorial"
      className={cn(
        "bg-card text-card-foreground flex h-full flex-col gap-2 rounded-xl border p-5",
        lead && "gap-3 @xl:p-8",
      )}
    >
      {view.heading && (
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            lead
              ? "text-2xl leading-tight @xl:text-3xl"
              : "text-lg leading-snug",
          )}
        >
          {view.heading}
        </h2>
      )}
      {view.intro && (
        <p className="text-muted-foreground text-sm">{view.intro}</p>
      )}
      <div className="min-w-0 [&>*:first-child]:mt-0">
        <LexicalRenderer content={view.body} />
      </div>
    </section>
  );
}

export const editorialItemTitle: ItemTitle<"editorial"> = (view) =>
  view.heading;
