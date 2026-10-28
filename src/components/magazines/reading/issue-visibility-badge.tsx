import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { IssueVisibility } from "@/lib/magazines/values";

const BADGE: Record<IssueVisibility, "membersOnly" | "teaser" | null> = {
  members: "membersOnly",
  teaser: "teaser",
  public: null,
};

export function IssueVisibilityBadge({
  visibility,
}: {
  visibility: IssueVisibility;
}) {
  const t = useTranslations("magazines.shelf");
  const key = BADGE[visibility];
  return key ? (
    <Badge variant="outline" className="font-normal">
      {t(key)}
    </Badge>
  ) : null;
}
