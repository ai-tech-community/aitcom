import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardSettingsPage() {
  const t = await getTranslations("dashboard");
  return (
    <div>
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / SETTINGS
        </span>
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        {t("settingsComingSoon")}
      </p>
    </div>
  );
}
