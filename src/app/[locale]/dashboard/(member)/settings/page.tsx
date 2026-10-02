import type { Metadata } from "next";

import { ConnectedIdentities } from "@/components/connected-identities";
import { OnboardingAnswersSettings } from "@/components/dashboard/onboarding-answers-settings";
import { ProfileSettings } from "@/components/dashboard/profile-settings";
import { NotificationPrefs } from "@/components/notifications/notification-prefs";
import { ChecklistSetting } from "@/components/onboarding/checklist-setting";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Settings tab: the main column only; the frame is the layout's. One
 * dashboard section per setting group.
 */
export default function DashboardSettingsPage() {
  return (
    <div className="space-y-10">
      <ProfileSettings />
      <OnboardingAnswersSettings />
      <NotificationPrefs />
      <ConnectedIdentities />
      <ChecklistSetting />
    </div>
  );
}
