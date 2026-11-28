"use client";

import { useTranslations } from "next-intl";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shows that unsent text was restored and offers to discard it. Callers with
 * a persistent live region can turn off the inline announcement.
 */
export function DraftNotice({
  onDiscard,
  announce = true,
}: {
  onDiscard: () => void;
  announce?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  return (
    <p
      role={announce ? "status" : undefined}
      className="text-muted-foreground flex items-center gap-1.5 text-xs"
    >
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
