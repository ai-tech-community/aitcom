import { useTranslations } from "next-intl";

import { LexicalRenderer } from "@/lib/lexical";
import { cn } from "@/lib/utils";

import { ItemRow } from "./item-row";
import type { ItemRendererProps, ItemTitle } from "./types";

/** Free-form text owned by the issue, rendered in full. */
export function EditorialItem({
  view,
  size,
  teaser,
}: ItemRendererProps<"editorial">) {
  const t = useTranslations("magazines.item");

  switch (size) {
    case "row":
      return (
        <ItemRow
          kind="editorial"
          title={view.heading}
          label={t("untitledEditorial")}
          intro={view.intro}
        />
      );
    case "lead":
    case "card":
      break;
  }
  const isLead = size === "lead";

  return (
    <section
      data-item-kind="editorial"
      className={cn(
        "bg-card text-card-foreground flex h-full flex-col gap-2 rounded-xl border p-5",
        isLead && "gap-3 @xl:p-8",
      )}
    >
      {view.heading && (
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            isLead
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
      {!teaser && (
        <div className="min-w-0 [&>*:first-child]:mt-0">
          <LexicalRenderer content={view.body} />
        </div>
      )}
    </section>
  );
}

export const editorialItemTitle: ItemTitle<"editorial"> = (view) =>
  view.heading;
