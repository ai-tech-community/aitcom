"use client";

import { api } from "@/trpc/react";
import { StaffSection } from "./staff-section";

export function ManageStaff({
  challengeId,
  isAdmin,
}: {
  challengeId: number;
  isAdmin: boolean;
}) {
  const staff = api.hackathon.listStaff.useQuery({ challengeId });

  if (staff.isLoading || !staff.data) return null;

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
