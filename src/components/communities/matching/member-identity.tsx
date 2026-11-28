import type { ReactNode } from "react";

import { RosterAvatar } from "@/components/members/roster-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";

export type MatchIdentity = {
  userId: string;
  displayName: string | null;
  image: string | null;
};

export function MemberIdentity({
  member,
  fallback,
  spacious = false,
  details,
}: {
  member: MatchIdentity;
  fallback: string;
  spacious?: boolean;
  details?: ReactNode;
}) {
  const name = member.displayName ?? fallback;
  const label = (
    <span
      data-slot="member-name"
      className={
        spacious
          ? "min-w-0 font-semibold wrap-break-word"
          : "min-w-0 text-sm font-medium break-words"
      }
    >
      {name}
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      {spacious ? (
        <RosterAvatar name={name} image={member.image} />
      ) : (
        <Avatar className="size-9 shrink-0">
          {member.image && <AvatarImage src={member.image} alt="" />}
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
      )}
      {details ? (
        <div className="min-w-0 space-y-1">
          {label}
          {details}
        </div>
      ) : (
        label
      )}
    </div>
  );
}
