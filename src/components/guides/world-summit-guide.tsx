import { WORLD_SUMMIT_EVENT_MD } from "@/content/guides/world-summit-event";

import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type WorldSummitKey = "kicker" | "title";

export function WorldSummitGuide({
  locale,
  t,
}: {
  locale: string;
  t: (key: WorldSummitKey) => string;
}) {
  const markdown =
    locale === "nl" ? WORLD_SUMMIT_EVENT_MD.nl : WORLD_SUMMIT_EVENT_MD.en;

  return (
    <GuideShell kicker={t("kicker")} title={t("title")}>
      <GuideMarkdown>{markdown}</GuideMarkdown>
    </GuideShell>
  );
}
