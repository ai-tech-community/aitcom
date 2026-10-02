"use client";

import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import { ProfileEditForm } from "@/components/profile-edit-form";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";

/**
 * The profile form on the Settings tab (anchor `#profile`). The side panel's
 * "You" card links here to edit; a member without a profile creates it here.
 */
export function ProfileSettings() {
  const t = useTranslations("dashboard");
  const query = api.members.getMyProfile.useQuery();

  return (
    <DashboardSection
      id="profile"
      title={t("profile.title")}
      status={statusFromQueries(query)}
    >
      {!query.data?.profile && (
        <p className="text-muted-foreground mb-4 text-sm">
          {t("completeProfile")}
        </p>
      )}
      <ProfileEditForm
        // Remount when the profile first appears so the form picks it up.
        key={query.data?.profile ? "edit" : "create"}
        initialData={query.data?.profile ?? null}
        names={query.data?.names}
      />
    </DashboardSection>
  );
}
