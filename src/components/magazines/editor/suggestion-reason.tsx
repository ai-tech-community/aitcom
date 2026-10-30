"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { formatEventDay } from "@/lib/event-time";
import type { SuggestionReason } from "@/lib/magazines/suggestions";

/** Editor-only context in the viewer's language; only dates and counts are mono. */
export function SuggestionReasonText({ reason }: { reason: SuggestionReason }) {
  const t = useTranslations("magazineEditor.builder.reasons");
  const locale = useLocale();
  const number = (chunks: ReactNode) => (
    <span className="font-mono">{chunks}</span>
  );
  const date = (at: string) => formatEventDay(at, locale);

  switch (reason.type) {
    case "waitingSince":
      return t.rich("waitingSince", { date: date(reason.at), number });
    case "topic":
      return t("topic", { topic: reason.topic });
    case "eventComingUp":
      return t.rich("eventComingUp", { date: date(reason.at), number });
    case "eventRecap":
      return t.rich("eventRecap", {
        date: date(reason.at),
        going: reason.going,
        number,
      });
    case "mostReplies":
      return t.rich("mostReplies", { count: reason.count, number });
    case "mostUpvotes":
      return t.rich("mostUpvotes", { count: reason.count, number });
    case "newMembers":
      return t.rich("newMembers", { count: reason.count, number });
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
