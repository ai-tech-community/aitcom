import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ConnectedIdentities } from "@/components/connected-identities";
import { SectionLabel } from "@/components/ui/section-label";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardSettingsPage() {
  const t = await getTranslations("dashboard");
  return (
    <div className="space-y-8">
      <SectionLabel>{t("settings")}</SectionLabel>
      <ConnectedIdentities />
    </div>
  );
}
