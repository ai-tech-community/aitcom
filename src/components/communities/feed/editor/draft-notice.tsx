"use client";

import { useTranslations } from "next-intl";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Says the text came back from an unsent draft, and offers to drop it. */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  const t = useTranslations("communities.feed.editor");
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <History aria-hidden="true" className="size-3.5" />
      {t("draftRestored")}
      <Button
        type="button"
        variant="link"
        size="xs"
        className="text-muted-foreground hover:text-foreground h-auto px-0 underline"
        onClick={onDiscard}
      >
        {t("discardDraft")}
      </Button>
    </p>
  );
}
