"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isLikelyEmail } from "@/server/hackathon/staff-invite";

export function StaffPicker({
  challengeId,
  role,
}: {
  challengeId: number;
  role: "organizer" | "judge";
}) {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");

  const candidates = api.hackathon.listStaffCandidates.useQuery(
    { challengeId, role, search: search || undefined },
    { enabled: search.length > 0 },
  );

  const invalidate = () => {
    void utils.hackathon.listStaff.invalidate({ challengeId });
    void utils.hackathon.listStaffCandidates.invalidate({ challengeId, role });
  };

  const grant = api.hackathon.grantStaff.useMutation({
    onSuccess: () => {
      invalidate();
      setSearch("");
    },
    onError: (e) => toast.error(e.message),
  });

  const invite = api.hackathon.inviteStaffByEmail.useMutation({
    onSuccess: (res) => {
      invalidate();
      setSearch("");
      toast.success(
        res.kind === "granted" ? "Added to the team." : "Invite sent.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const roleLabel = role === "organizer" ? "organizer" : "judge";
  const items = candidates.data?.items ?? [];
  const showInviteByEmail =
    isLikelyEmail(search) && items.length === 0 && !candidates.isFetching;

  return (
    <div className="mt-3 space-y-2">
      <Input
        placeholder={`Search members by name or email to add a ${roleLabel}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {search.length > 0 && (
        <ul className="divide-y rounded-md border">
          {items.map((c) => {
            const displayName = c.displayName ?? c.email ?? "Member";
            return (
            <li
              key={c.userId}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar className="size-7">
                  <AvatarImage src={c.image ?? undefined} alt={displayName} />
                  <AvatarFallback>
                    {displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.email}
                  </span>
                </span>
              </span>
              <Button
                size="sm"
                disabled={grant.isPending}
                onClick={() =>
                  grant.mutate({ challengeId, userId: c.userId, role })
                }
              >
                Add
              </Button>
            </li>
            );
          })}

          {showInviteByEmail && (
            <li className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm">
                No member matches. Invite{" "}
                <span className="font-medium">{search.trim()}</span> by email.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={invite.isPending}
                onClick={() =>
                  invite.mutate({ challengeId, email: search.trim(), role })
                }
              >
                Invite {roleLabel}
              </Button>
            </li>
          )}

          {!showInviteByEmail && items.length === 0 && !candidates.isFetching && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No matches.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
