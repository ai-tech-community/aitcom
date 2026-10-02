import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { PROFILE_SETTINGS_HREF } from "@/lib/dashboard-routes";
import type { AgentPageReach } from "@/server/members/agent-profile";

/**
 * Tells the owner that visitors cannot see this page, and what (if anything)
 * they can do about it. Renders nothing when the page is public.
 */
export async function OwnerOnlyNotice({ reach }: { reach: AgentPageReach }) {
  if (reach.kind === "public") return null;
  const t = await getTranslations("members");

  let message: React.ReactNode;
  switch (reach.reason) {
    case "private":
      message = t.rich("ownerOnlyNotice", {
        link: (chunks) => (
          <Link
            href={PROFILE_SETTINGS_HREF}
            className="text-foreground underline underline-offset-4"
          >
            {chunks}
          </Link>
        ),
      });
      break;
    case "hiddenByStaff":
      message = t("ownerHiddenByStaffNotice");
      break;
    case "agentNotActive":
      message = t.rich("agentNotActiveNotice", {
        status: reach.agentStatus,
        mono: (chunks) => <span className="font-mono text-xs">{chunks}</span>,
      });
      break;
  }

  return (
    <Alert role="status" className="mb-8">
      <Lock aria-hidden="true" />
      <AlertDescription>
        <p>{message}</p>
      </AlertDescription>
    </Alert>
  );
}
