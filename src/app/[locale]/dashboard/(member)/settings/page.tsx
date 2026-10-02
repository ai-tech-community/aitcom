import type { Metadata } from "next";

import { ConnectedIdentities } from "@/components/connected-identities";
import { OnboardingAnswersSettings } from "@/components/dashboard/onboarding-answers-settings";
import { ProfileSettings } from "@/components/dashboard/profile-settings";
import { ChecklistSetting } from "@/components/onboarding/checklist-setting";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardSettingsPage() {
  return (
    <div className="space-y-10">
      <ProfileSettings />
      <ConnectedIdentities />
      <OnboardingAnswersSettings />
      <ChecklistSetting />
    </div>
  );
}
