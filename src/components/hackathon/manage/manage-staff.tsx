"use client";

import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffSection } from "./staff-section";

export function ManageStaff({
  challengeId,
  isAdmin,
}: {
  challengeId: number;
  isAdmin: boolean;
}) {
  const t = useTranslations("hackathon");
  const staff = api.hackathon.listStaff.useQuery({ challengeId });

  if (staff.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (staff.isError) {
    return <ErrorState onRetry={() => staff.refetch()} />;
  }
  if (
    !staff.data ||
    (staff.data.organizers.length === 0 &&
      staff.data.judges.length === 0 &&
      staff.data.pendingInvites.length === 0)
  ) {
    return <EmptyState title={t("staffEmpty")} />;
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <StaffSection
          challengeId={challengeId}
          role="organizer"
          title="Organizers"
          members={staff.data.organizers}
          pendingInvites={staff.data.pendingInvites}
        />
      )}
      <StaffSection
        challengeId={challengeId}
        role="judge"
        title="Judges"
        members={staff.data.judges}
        pendingInvites={staff.data.pendingInvites}
      />
    </div>
  );
}
