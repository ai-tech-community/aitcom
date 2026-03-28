"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { OnboardingQuestions } from "@/components/onboarding-questions";
import { api } from "@/trpc/react";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const utils = api.useUtils();

  const handleComplete = () => {
    void utils.onboarding.getStatus.invalidate();
    void utils.members.getMyProfile.invalidate();
    router.push("/dashboard");
  };

  return (
    <div className="py-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t("welcomeTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("welcomeSubtitle")}</p>
      </div>
      <OnboardingQuestions onComplete={handleComplete} />
    </div>
  );
}
