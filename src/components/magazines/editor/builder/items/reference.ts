"use client";

import { createElement } from "react";

import { itemTitle } from "@/components/magazines/items/registry";
import type { PickableKindId } from "@/lib/magazines/picker";

import { PickerPanel } from "../picker-panel";
import type {
  AddPanelProps,
  BuilderItemKind,
  BuilderItemOf,
  BuilderItemsMessage,
} from "./types";

/**
 * A builder kind whose content lives somewhere else (an article, and the
 * kinds that follow). The row is named by the saved view, else the title
 * it was added with. The preview waits for the first save, then follows
 * the intro the editor typed.
 */
export function referenceBuilderKind<K extends PickableKindId>(opts: {
  kind: K;
  labelKey: BuilderItemsMessage;
  referenceOf: (item: BuilderItemOf<K>) => string;
  openLabelKey?: BuilderItemsMessage;
}): BuilderItemKind<K> {
  function AddPanel(props: AddPanelProps) {
    return createElement(PickerPanel, { kind: opts.kind, ...props });
  }

  return {
    labelKey: opts.labelKey,
    rowTitle(_item, ctx) {
      const fromSaved =
        ctx.saved && !("unavailable" in ctx.saved)
          ? itemTitle(ctx.saved)
          : null;
      return fromSaved ?? ctx.titleHint ?? ctx.t(opts.labelKey);
    },
    isSavable: () => true,
    previewView(item, saved) {
      // Extract does not see `key` or `intro` while K is still a type parameter.
      const row = item as BuilderItemOf<PickableKindId>;
      if (!saved) return null;
      if ("unavailable" in saved) return { ...saved, itemId: row.key };
      return { ...saved, itemId: row.key, intro: row.intro ?? null };
    },
    referenceKey: opts.referenceOf,
    openLabelKey: opts.openLabelKey,
    AddPanel,
  };
}
