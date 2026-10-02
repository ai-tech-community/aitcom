import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { ONBOARDING_HREF } from "@/lib/dashboard-routes";
import { DashboardSection } from "@/components/dashboard/dashboard-section";

/**
 * Settings entry point to the onboarding questions. The "Get started" card
 * links there only until the checklist is done or dismissed; this keeps the
 * answers (which shape the checklist and suggestions) changeable for good.
 */
export function OnboardingAnswersSettings() {
  const t = useTranslations("dashboard.answers");
  return (
    <DashboardSection title={t("title")}>
      <p className="text-muted-foreground max-w-prose text-sm">
        {t("description")}
      </p>
      <Link
        href={ONBOARDING_HREF}
        className="text-foreground focus-visible:ring-ring/50 group mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
      >
        {t("cta")}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        />
      </Link>
    </DashboardSection>
  );
}
