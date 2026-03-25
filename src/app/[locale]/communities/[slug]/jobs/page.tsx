"use client";
import { useTranslations } from "next-intl";

export default function CommunityJobsPage() {
  const t = useTranslations("communities.profile");
  return (
    <div>
      <h2 className="text-xl font-semibold">{t("jobs")}</h2>
      <p className="text-muted-foreground mt-2">Coming soon.</p>
    </div>
  );
}
