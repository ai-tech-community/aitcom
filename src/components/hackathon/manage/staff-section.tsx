"use client";

import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StaffPicker } from "./staff-picker";

type StaffMember = {
  id: string;
  userId: string;
  displayName: string | null;
  email: string;
  image: string | null;
};
type PendingInvite = {
  id: string;
  email: string;
  role: "organizer" | "judge";
};

export function StaffSection({
  challengeId,
  role,
  title,
  members,
  pendingInvites,
}: {
  challengeId: number;
  role: "organizer" | "judge";
  title: string;
  members: StaffMember[];
  pendingInvites: PendingInvite[];
}) {
  const utils = api.useUtils();
  const invalidate = () =>
    void utils.hackathon.listStaff.invalidate({ challengeId });

  const revoke = api.hackathon.revokeStaff.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const revokeInvite = api.hackathon.revokeStaffInvite.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });

  const roleInvites = pendingInvites.filter((i) => i.role === role);

  return (
    <section>
      <h3 className="font-medium">{title}</h3>

      <ul className="mt-2 divide-y rounded-md border">
        {members.length === 0 && roleInvites.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            None yet.
          </li>
        )}

        {members.map((m) => {
          const name = m.displayName ?? m.email;
          return (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar className="size-7">
                  <AvatarImage src={m.image ?? undefined} alt={name} />
                  <AvatarFallback>
                    {name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.email}
                  </span>
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                disabled={revoke.isPending}
                onClick={() =>
                  revoke.mutate({ challengeId, userId: m.userId, role })
                }
              >
                Remove
              </Button>
            </li>
          );
        })}

        {roleInvites.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between gap-2 px-3 py-2 opacity-70"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{inv.email}</span>
              <span className="block text-xs text-muted-foreground">
                Invited · pending
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={revokeInvite.isPending}
              onClick={() => revokeInvite.mutate({ inviteId: inv.id })}
            >
              Cancel
            </Button>
          </li>
        ))}
      </ul>

      <StaffPicker challengeId={challengeId} role={role} />
    </section>
  );
}
