"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
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
  const debouncedSearch = useDebouncedValue(search, 300);

  const candidates = api.hackathon.listStaffCandidates.useQuery(
    { challengeId, role, search: debouncedSearch || undefined },
    {
      enabled: debouncedSearch.length > 0,
      placeholderData: (prev) => prev,
    },
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
    isLikelyEmail(debouncedSearch) &&
    items.length === 0 &&
    !candidates.isFetching;

  return (
    <div className="mt-3 space-y-2">
      <Input
        placeholder={`Search members by name or email to add a ${roleLabel}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {debouncedSearch.length > 0 && (
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
                    <span className="text-muted-foreground block truncate text-xs">
                      {c.email}
                    </span>
                  </span>
                </span>
                <Button
                  size="sm"
                  aria-label={`Add ${displayName} as ${roleLabel}`}
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
                <span className="font-medium">{debouncedSearch.trim()}</span> by
                email.
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Invite ${debouncedSearch.trim()} as ${roleLabel}`}
                disabled={invite.isPending}
                onClick={() =>
                  invite.mutate({
                    challengeId,
                    email: debouncedSearch.trim(),
                    role,
                  })
                }
              >
                Invite {roleLabel}
              </Button>
            </li>
          )}

          {!showInviteByEmail &&
            items.length === 0 &&
            !candidates.isFetching && (
              <li className="text-muted-foreground px-3 py-2 text-sm">
                No matches.
              </li>
            )}
        </ul>
      )}
    </div>
  );
}
